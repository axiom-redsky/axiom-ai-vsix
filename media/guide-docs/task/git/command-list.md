---
sidebar_position: 1
displayed_sidebar: 'taskDocSidebar'
title: 'Git 명령어'
---

# Git 명령어 정리


## 기본 master 브랜치를 main 으로 변경하기
```sh
git branch -m master main
```


## Git conflict가 났을 때 강제 pull
```sh
git fetch --all
git reset --hard origin/main
git pull origin main
```
