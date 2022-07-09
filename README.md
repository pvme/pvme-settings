Centralised storage for various PVME data that is used by:

- [rotation-builder](https://github.com/pvme/rotation-builder)
- [guide-editor](https://github.com/pvme/guide-editor)
- [pvme.github.io](https://github.com/pvme/pvme.github.io)

The data is collected from various sources and then converted to json to be easily accessible:

![https://i.imgur.com/48gL6eJ.png](https://i.imgur.com/48gL6eJ.png)

## Settings

| URL                                                          | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| [users.json](https://raw.githubusercontent.com/pvme/pvme-settings/settings/users/users.json) | Discord user names from ID's in [pvme-guides](https://github.com/pvme/pvme-guides). |
| [channels.json](https://raw.githubusercontent.com/pvme/pvme-settings/pvme-discord/channels.json) | Channel names and ID's from the PVME Discord with their corresponding files in [pvme-guides](https://github.com/pvme/pvme-guides). |
|                                                              |                                                              |

## Updating settings

Most settings are automatically updated through various sources.

Some settings however need to be updated manually.

### Requirements

Python 3.10

```
pip install pipenv --upgrade
```

### Instructions

#### users.json

`users.json` is not updated from the same workflow as the PVME spreadsheet because I'm not big on adding a discord bot token as a repository secret.

1. run `update_users.bat`

