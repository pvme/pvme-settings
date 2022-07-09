echo off

rmdir /q/s pvme-guides
git clone https://github.com/pvme/pvme-guides.git

pipenv install --ignore-pipfile --dev
pipenv run python discord_users.py

rmdir /q/s pvme-settings
git clone -b settings/users https://github.com/pvme/pvme-settings.git

xcopy /y build\users.json pvme-settings

cd pvme-settings

git config user.name updater
git config user.email ""

git add .
git commit --allow-empty -m "update"
git push

cd ..