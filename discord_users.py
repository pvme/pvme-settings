import json
import os
import time
import re
import glob

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


BOT_TOKEN = os.environ['BOT_TOKEN']


def get_user_from_id(user_id):
    headers = {
        'authorization': f"Bot {BOT_TOKEN}"
    }
    response = requests.get(f"https://discord.com/api/v9/users/{user_id}", headers=headers)

    if response.status_code == 200:
        return response.json()['username']
    if response.status_code == 429:
        time.sleep(float(response.json()['retry_after']) + 1.0)
        return get_user_from_id(user_id)
    print(f"{response.status_code}: {response.text}")


def get_unique_users(pvme_guides):
    unique_users = set()
    for file in glob.iglob(f"{pvme_guides}/**/*.txt"):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()

        users = re.findall(r"<@!?([0-9]{18})>", content)
        for user in users:
            unique_users.add(user)

    return unique_users


def write_users_json(users):
    if not os.path.isdir('build'):
        os.mkdir('build')

    with open('build/users.json', 'w', encoding='utf-8') as file:
        json.dump(users, file, separators=(',', ':'))


if __name__ == '__main__':
    unique_users = get_unique_users('pvme-guides')
    users = []
    for i, user_id in enumerate(unique_users):
        # if i == 5:
        #     break
        print(f"{i+1}/{len(unique_users)}")
        user_name = get_user_from_id(user_id)
        users.append({"name": user_name if user_name else "undefined", "id": user_id})

    write_users_json(users)
