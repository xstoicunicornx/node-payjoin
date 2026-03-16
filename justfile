### basic commands

build:
  npm run build

clean:
  rm -rf dist/
  rm -f *.db

init:
  just clean
  just build

command *ARGS:
  node dist/index.js {{ ARGS }}



### app commands

receive ARG:
  node dist/index.js "receive" {{ ARG }}

send ARG:
  node dist/index.js "send" "{{ ARG }}"
