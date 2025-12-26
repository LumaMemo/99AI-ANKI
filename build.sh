#!/bin/bash

set -e


cd admin/
pnpm install
pnpm build
cd ..

cd chat/
pnpm install
pnpm build
cd ..

cd service/
pnpm install
pnpm build
cd ..

rm -rf ./AIWebQuickDeploy/dist/* ./AIWebQuickDeploy/public/admin/* ./AIWebQuickDeploy/public/chat/*
mkdir -p ./AIWebQuickDeploy/dist ./AIWebQuickDeploy/public/admin ./AIWebQuickDeploy/public/chat

cp service/pm2.conf.json ./AIWebQuickDeploy/pm2.conf.json
cp service/package.json ./AIWebQuickDeploy/package.json

cp service/.env.example ./AIWebQuickDeploy/.env.example
cp service/.env.docker ./AIWebQuickDeploy/.env.docker
cp service/Dockerfile ./AIWebQuickDeploy/Dockerfile
cp service/docker-compose.yml ./AIWebQuickDeploy/docker-compose.yml
cp service/.dockerignore ./AIWebQuickDeploy/.dockerignore

cp -a service/dist/* ./AIWebQuickDeploy/dist
cp -r admin/dist/* ./AIWebQuickDeploy/public/admin
cp -r chat/dist/* ./AIWebQuickDeploy/public/chat

# WeChat Official Account domain verification file(s)
# Place MP_verify_*.txt or other verification files at the public web root. In this project, it is served from AIWebQuickDeploy/public/chat.
mkdir -p ./AIWebQuickDeploy/public/chat
shopt -s nullglob
verify_files=(./docs/MP_verify_*.txt ./docs/8f84263e4ad083090fc2a385d633789d.txt)
if [ ${#verify_files[@]} -gt 0 ]; then
	cp -f "${verify_files[@]}" ./AIWebQuickDeploy/public/chat/
	echo "已复制微信公众号验证文件: ${verify_files[*]} -> AIWebQuickDeploy/public/chat/"
else
	echo "未找到微信公众号验证文件，跳过复制"
fi

echo "打包完成"