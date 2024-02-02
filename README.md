# src-queue-checker
Discord Bot to check the Speedrun.com verification queues and notify verifiers of runs to be verified

## Add to your server
Click [here](https://discord.com/oauth2/authorize?client_id=1086518188600209509&scope=bot&permissions=0) to add the bot to your server and authorize its permissions. 

## Commands
This bot uses slash (/) commands as an interface. The commands available are as follows
### /config
The main function of the bot, this has all of the customization options as follows:
#### leaderboards
Input type: `string`

Leaderboards to report runs from, abbreviations separated by commas. ex: smo,smoce
#### records
Input type: `boolean`

Whether or not to only report world records
#### misc
Input type: `boolean`

Whether or not to include "miscellaneous" categories
#### scope
Input type: `string` (options)

Whether to include only "Level" runs, only "Full-Game" runs, or all runs
#### channel
Input type: `channel`

The channel for the bot to report runs in.

# Setting up a personal instance (not recommended for most users)
## Running the bot from source code
### Requires Node.js

Install Node.js with your package manager, for example:

`brew install node.js`

*make sure to use your own package manager's syntax

### Install discord.js
Use the following command to install discord.js from the dependencies in `package.json`
```
npm install
```

### Set up file structure for Secrets and other instance-specific setup
## Automatic Setup
Use the following command to automatically set up the necessary files:
```
python3 setup.py
```

## Manual Setup
Before running, your file structure should include these files:
```
src-queue-checker
│   README.md
│   main.js
│   routes.js
│   secrets.json
│   messages.json
|   checkDate.json
│   config.json
│   package.json
|
```

Format `secrets.json` as follows with credentials from the discord developer portal:
```
{
    "token":*Token*,
    "appID":*Application ID
}
```

Format `checkDate.json` as follows:
```
{
    "lastSubmitted":null
}
```


Ensure that all other `.json` files are formatted as empty json objects, as the program will populate them later. Their contents should look like:

```
{}
```

### Starting the bot
In the `src-queue-checker` folder, do the following commands:
```
node routes.js
```
This tells discord what your bot's commands are
```
node main.js
```
This will start the bot, and it should automatically check the queue on startup, as well as every 10 minutes after.
The bot will "flush logs" every day by removing entries from `messages.json` for runs that are no longer pending.
The bot should now be available to interact with via slash commands!