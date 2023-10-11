# Updating users.json

[users.json](https://raw.githubusercontent.com/pvme/pvme-settings/settings/users/users.json) is updated manually because I'm not keen on adding a discord bot token as a repository secret. 

```commandline
cd pvme-settings\pvme_spreadsheet
```
```toml
# .env
BOT_TOKEN = "<BOT_TOKEN>"
```
*Note: can be any discord bot token.*

```commandline
update_users.bat
```

# Development

In addition to previous setup.

## Install

```commandline
virtualenv venv
venv\Scripts\activate
pip install pip-tools
```

## Pip-Tools Workflow

https://pip-tools.readthedocs.io/en/latest/
