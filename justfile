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
  npx tsx src/index.ts {{ ARGS }}



### app commands

receive ARG:
  npx tsx src/index.ts "receive" {{ ARG }}

send ARG1 ARG2="0":
  npx tsx src/index.ts "send" "{{ ARG1 }}" "{{ARG2}}"
