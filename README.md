Centralized storage for PVME settings that are used by:

- [rotation-builder](https://github.com/pvme/rotation-builder)
- [guide-editor](https://github.com/pvme/guide-editor)
- [pvme.github.io](https://github.com/pvme/pvme.github.io)

The settings are stored as JSON to be easily accessible through HTTP requests:

![https://i.imgur.com/48gL6eJ.png](https://i.imgur.com/48gL6eJ.png)

# Settings

| URL                                                                                                                           | Description                                                                                                                                                                 |
|-------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [users.json](https://raw.githubusercontent.com/pvme/pvme-settings/settings/users/users.json)                                  | Discord user names from ID's in [pvme-guides](https://github.com/pvme/pvme-guides).                                                                                         |
| [channels.json](https://raw.githubusercontent.com/pvme/pvme-settings/pvme-discord/channels.json)                              | Channel names and ID's from the [PVME Discord](https://discord.gg/6djqFVN) with their corresponding files in [pvme-guides](https://github.com/pvme/pvme-guides).            |
| [roles.json](https://raw.githubusercontent.com/pvme/pvme-settings/pvme-discord/roles.json)                                    | Role names and role ID's from [PVME Discord](https://discord.gg/6djqFVN).                                                                                                   |
| [pvme_spreadsheet.json](https://raw.githubusercontent.com/pvme/pvme-settings/settings/pvme-spreadsheet/pvme_spreadsheet.json) | Data from [PVME spreadsheet](https://docs.google.com/spreadsheets/d/1OGM9MBUG2bQVbHxlm86Xfs60soFcjINSOrPv1WL3Vgw/edit#gid=1210777994) accessed as `data['Perks']['E'][32]`. |
| [emojis.json](https://raw.githubusercontent.com/pvme/pvme-settings/master/emojis/emojis.json) | Emojis in [PVME Discord](https://discord.gg/6djqFVN).                                                                                                                                                              |

# Development

[pvme-settings](https://github.com/pvme/pvme-settings) is a monorepo where every folder is a separate project with its own dependencies.

This ensures that maintaining specific setting generation scripts don't risk breaking unrelated settings.

Development instructions are in the `README.md` for every folder.