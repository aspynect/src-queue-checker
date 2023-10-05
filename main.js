const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const { EmbedBuilder } = require('discord.js');
const fs = require('fs/promises')
const secrets = require('./secrets.json');
var config = require('./config.json');
var messages = require('./messages.json')


// To execute when bot logs in (loop for checking queue)
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    setInterval(async () => {
        await checkQueue();
    }, 60000 /*5000*/); //TODO make sure to reset this before implementing
    setInterval(async () => {
        flushLogs();
    }, 86400000)
});

client.on('interactionCreate', async interaction => {
    if (interaction.commandName === 'config') {
        // Init config if not exist
        if (!config[interaction.guild.id]) {
            config[interaction.guild.id] = {
                
                "games":[],
                "onlyRecords":true,
                "misc":false,
                "scope":"full-game",
                "channel":null
            }
            await fs.writeFile('./config.json', JSON.stringify(config));
        }

        let guildConfig = config[interaction.guild.id] // Get config for current guild
        // Dumb check for if options are selected to be overwritten
        if (interaction.options.getString('leaderboards') || interaction.options.getBoolean('records')!== null || interaction.options.getBoolean('misc')!== null || interaction.options.getString('scope') || interaction.options.getChannel('channel')) {
            // Gets game ID from abbreviation 
            if(interaction.options.getString('leaderboards')) {
                let gamesArray = interaction.options.getString('leaderboards').split(',');
                for (const games in gamesArray) {
                    gamesArray[games] = (await (await fetch(`https://speedrun.com/api/v1/games?abbreviation=${gamesArray[games]}`)).json()).data[0].id
                }
                guildConfig.games = gamesArray

            }
            //Sets values for other interactions
            if(interaction.options.getBoolean('records') !== null) {
                guildConfig.onlyRecords = interaction.options.getBoolean('records');
            }
            if(interaction.options.getBoolean('misc')!== null) {
                guildConfig.misc = interaction.options.getBoolean('misc');
            }
            if(interaction.options.getString('scope')) {
                guildConfig.scope = interaction.options.getString('scope');
            }
            if(interaction.options.getChannel('channel') || interaction.options.getChannel('channel')) {
                interactionChannel = interaction.options.getChannel('channel')
                guildConfig.channel = interactionChannel.id
            }
            config[interaction.guild.id] = guildConfig
            await fs.writeFile('./config.json', JSON.stringify(config));
        }
        // Creates game list string from config
        let gamesList = "" 
        for (const game of guildConfig.games) {
            let gameInfo = (await (await fetch(`https://speedrun.com/api/v1/games/${game}`)).json()).data
            gamesList = gameInfo.names.international + "(" + gameInfo.abbreviation + "), \n" + gamesList
        }
        gamesList = gamesList.slice(0,-3)
        if (!config[interaction.guild.id]) {
            gamesList = "No Games"
        }

        // Builds embed
        const runEmbed = new EmbedBuilder()
        .setColor(0xFF00FF)
        .setTitle(`Server Configuration`)
        .setDescription('Bot configuration for the current server')
        .addFields(
            { name: 'Leaderboards:', value: `${gamesList}` },
            { name: 'Only Records:', value: `${guildConfig.onlyRecords}`, inline: true },
            { name: 'Miscellaneous:', value: `${guildConfig.misc}`, inline: true },
            { name: 'Scope:', value: `${guildConfig.scope}`, inline: true },
            { name: 'Channel:', value: `<#${guildConfig.channel}>` }
            )
        .setTimestamp()

        await interaction.reply({embeds: [runEmbed]});
    }

    if (interaction.commandName === 'ping') {
        await interaction.reply({content: `h`, ephemeral: true});
    }
})


async function checkQueue() {
    console.log("checking queue")
    for (const guildID of client.guilds.cache.keys()) {
        if (!config[guildID].channel) {
            console.log(`No channel config found for ${guildID}`)
            continue; // Skips guild if no channel config
        }
        let guildConfig = config[guildID]
        if (Object.keys(config).includes(guildID)) { // Checks if guild has config
            for (const gameID of guildConfig.games) { //CONTINUE here

                let queueData = await fetchQueue(gameID);
                let recordsData = await fetchRecords(gameID, guildConfig.scope, guildConfig.misc);
                handleRuns(queueData, recordsData, guildID, guildConfig.onlyRecords)
            }
        } else {
            console.log(`Server ${guildID} has no config`);
        }
    }
}

// Combines series of paginated run segments from the queue
async function fetchQueue(gameID) {
    let runs = []
    let offset = 0

    while(true) {
        let tempRuns = await fetchPage(gameID, offset);
        if (!tempRuns) {
            console.log(`Queue failed to load for ${gameID}`)
            return undefined;
        }
        if (tempRuns.length === 0) {
            break;
        }

        runs = [...runs, ...tempRuns];
        offset += 200
    }
    return runs;
}

// Fetches paginated segment of queue
async function fetchPage(gameID, offset) {
    try {
        let tempPage = await (await fetch(`https://speedrun.com/api/v1/runs?game=${gameID}&status=new&offset=${offset}&max=200&embed=players,category`)).json();
        return tempPage.data
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

// Fetches records and returns a map of records
async function fetchRecords(gameID, scope, misc) {
    try {
        let recordObject = await (await fetch(`https://speedrun.com/api/v1/games/${gameID}/records?miscellaneous=${misc}&scope=${scope}&top=1&max=200`)).json();

        let recordsDict = {"levels":{},"categories":{}};
        //TODO work out how to do this with the other part that isnt checking properly, need to set smth up
        for (const record of recordObject.data) {
            if (record.level != null) {
                recordsDict["levels"][record.level] = record.runs[0].run.times.primary_t
            } else {
                recordsDict["categories"][record.category] = record.runs[0].run.times.primary_t
            }
        }
        return recordsDict;
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

// Sends message and writes to message log to keep track of what runs are already sent
async function handleRuns(runList, recordsData, guildID, onlyRecords) {
    console.log("handling runs")
    // Ensures guild has a messages dictionary entry
    if(!messages[guildID]) {
        messages[guildID] = []
    }
    for (const run of runList) {
        if (!messages[guildID].includes(run.id)) {
            let reportChannel = await client.guilds.cache.get(guildID).channels.cache.get(config[guildID].channel);
            let gameData = (await (await fetch(`https://speedrun.com/api/v1/games/${run.game}`)).json()).data
            typeString = "Run"
            //TODO this isn't checking properly :/
            if (run.level != null) {
                categoryRecord = recordsData["levels"][run.level]
            } else {
                categoryRecord = recordsData["categories"][run.category]
            }
            if (run.times.primary_t < categoryRecord) {
                typeString = "Record"
            } else if (onlyRecords == true) {
                continue; //skip entry if not record in only records mode
            }

            // Time math :(
            let totalSeconds = run.times.primary_t
            let hours = Math.floor(totalSeconds / 3600);
            totalSeconds %= 3600;
            let minutes = Math.floor(totalSeconds / 60);
            let seconds = totalSeconds % 60;
            let tempTime = seconds.toString();
            if (minutes > 0 || hours > 0) {
                tempTime = minutes.toString() + ":" + tempTime
            }
            if (hours > 0) {
                tempTime = hours.toString() + ":" + tempTime
            }

            //builds embed for bot output
            const runEmbed = new EmbedBuilder()
            .setColor(0xFF00FF)
            .setTitle(`New ${typeString} in queue for ${gameData.names.international}`)
            .setURL(`${run.weblink}`)
            .addFields(
                { name: 'Description:', value: `${run.comment}` },
                { name: 'Runner:', value: `${run.players.data[0].names.international}`, inline: true },
                { name: 'Category:', value: `${run.category.data.name}`, inline: true },
                { name: 'Time', value: `${tempTime}`, inline: true },
                )
            .setTimestamp()

            await reportChannel.send({embeds: [runEmbed]}); // Sends embed to channel
            messages[guildID].push(`${run.id}`) // Adds the logged run to the messages list

            await fs.writeFile('./messages.json', JSON.stringify(messages));
        }
    }
}

async function flushLogs() {
    console.log("Flushing Logs")
    for (serverID of Object.keys(messages)) {
        let tempArray = messages[serverID];
        for (runID of messages[serverID]) {
            let runStatus
            try {
                runStatus = (await (await fetch(`https://speedrun.com/api/v1/runs/${runID}`)).json()).data.status.status
            } catch {
                runStatus = undefined
            }
            try {console.log(runStatus)} catch(err) {console.error(err)}
            if (!runStatus || runStatus !== "new") {
                tempArray.splice(tempArray.indexOf(runID), 1)
            }
        }
        messages[serverID] = tempArray
    }
    await fs.writeFile('./messages.json', JSON.stringify(messages));
}

client.login(secrets.token);