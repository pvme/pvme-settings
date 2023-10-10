import json
import os

import gspread
from google.oauth2.service_account import Credentials as ServiceAccountCredentials

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


GS_URL = os.environ['GS_URL']
GS_PRIVATE_KEY = os.environ['GS_PRIVATE_KEY']
GS_CLIENT_EMAIL = os.environ['GS_CLIENT_EMAIL']
GS_TOKEN_URI = os.environ['GS_TOKEN_URI']


def get_sheet():
    # set the credentials
    credentials = ServiceAccountCredentials.from_service_account_info({
        'private_key': GS_PRIVATE_KEY,
        'client_email': GS_CLIENT_EMAIL,
        'token_uri': GS_TOKEN_URI},
        scopes=gspread.auth.READONLY_SCOPES)

    # authenticate + obtain the pvme-guides spreadsheet URL
    gc = gspread.client.Client(auth=credentials)
    return gc.open_by_url(GS_URL)


def get_json_lut(sheet: gspread.Spreadsheet):
    """
    CONVERT:
    A           B               C       D           E       F       G
    Nightmares  ...             ...     ....        ...     ...     ...
    ...         ...             ...     ...         ...     Kills   43314
    Drop        Drop per kill   Value   Gp/kill     ...     ...     ...
    Blood Rune  4.1356          985	    2,353       ...     ...     ...
    Coins       3,748.1958      1	    3,748       ...     ...     ...
    Dragon      Arrowheads      1.3333  379387     ...     ...     ...

    TO:
    {
        'Slayer': {
            'A': ['A', 'Nightmares', '...', 'Drop', 'Blood Rune', 'Coins', 'Dragon'],
            'B': ['B', '...', '...', 'Drop per kill', '4.1356', '3,748.1958', 'Arrowheads'],
            ...
        },
        'Perks': {},
        ...
    }
    """
    lut = {}
    for worksheet in sheet.worksheets():
        values = worksheet.get_all_values()
        compact_col_count = len(values[0])  # worksheet.col_count returns all columns (even those with no data)
        compact_row_count = len(values)     # worksheet.rol_count returns all rows

        lut[worksheet.title] = {}
        for col_n in range(compact_col_count):
            col_l = chr(col_n + 65)                 # 1 -> A
            lut[worksheet.title][col_l] = [col_l]   # set index 0 to header 'A', 'B' so index for cells starts with 1
            for row_n in range(compact_row_count):
                lut[worksheet.title][col_l].append(values[row_n][col_n])

    return lut


def write_json_lut(json_lut):
    if not os.path.isdir('build'):
        os.mkdir('build')

    with open('pvme_spreadsheet.json', 'w') as file:
        json.dump(json_lut, file, separators=(',', ':'))


if __name__ == '__main__':
    sheet = get_sheet()
    json_lut = get_json_lut(sheet)
    write_json_lut(json_lut)
