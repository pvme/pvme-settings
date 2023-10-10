echo off

rmdir /q/s pvme-guides
git clone https://github.com/pvme/pvme-guides.git

virtualenv update_users_venv
call update_users_venv\Scripts\activate
call pip install -r requirements.txt
call python discord_users.py
call deactivate

rmdir /q/s pvme-settings
git clone -b settings/users https://github.com/pvme/pvme-settings.git

xcopy /y users.json pvme-settings

cd pvme-settings

git config user.name updater
git config user.email ""

git add .
git commit --allow-empty -m "update"
git push

cd ..
rmdir /q/s update_users_venv