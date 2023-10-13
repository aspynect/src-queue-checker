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
    checkQueue();
    setInterval(async () => {
        await checkQueue();
    }, 600000);
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
                leaderboardsString = interaction.options.getString('leaderboards').replace(/ /g, '');
                let gamesArray = leaderboardsString.split(',');
                try {
                    for (const games in gamesArray) {
                        gamesArray[games] = (await (await safeFetch(`https://speedrun.com/api/v1/games?abbreviation=${gamesArray[games]}`)).json()).data[0].id
                    }
                    guildConfig.games = gamesArray
                } catch(err) {
                    console.log(err);
                    interaction.reply({content:'Improperly formatted leaderboards entry. Please try again.', ephemeral:true})
                    return
                }
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
            let gameInfo = (await (await safeFetch(`https://speedrun.com/api/v1/games/${game}`)).json()).data
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
                if (typeof queueData != 'object') {
                    console.log("Failed to properly fetch queue")
                    return
                }
                let recordsData = await fetchRecords(gameID, guildConfig.scope, guildConfig.misc);

                queueData = cleanQueue(queueData, guildConfig.misc, guildConfig.scope);

                handleRuns(queueData, recordsData, guildID, guildConfig.onlyRecords);
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
        let tempPage = await (await safeFetch(`https://speedrun.com/api/v1/runs?game=${gameID}&status=new&offset=${offset}&max=20&orderby=submitted&direction=desc&embed=players,category`)).json();
        return tempPage.data
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

// Fetches records and returns a map of records
async function fetchRecords(gameID, scope, misc) {
    try {
        let recordObject = await (await safeFetch(`https://speedrun.com/api/v1/games/${gameID}/records?miscellaneous=${misc}&scope=${scope}&top=1&max=200`)).json();

        let recordsDict = {"levels":{},"categories":{}};
        for (const record of recordObject.data) {
            if (record.level != null && record.runs.length > 0) {
                recordsDict["levels"][record.level] = record.runs[0].run.times.primary_t
            } else if (record.category != null && record.runs.length > 0) {
                recordsDict["categories"][record.category] = record.runs[0].run.times.primary_t
            }
        }
        return recordsDict;
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

async function fetchLevelName(levelID) {
    let level = (await (await safeFetch(`https://speedrun.com/api/v1/levels/${levelID}`)).json()).data
    return level.name
}

// Fetch but if the fetch fails just try again bc the src api sucks
async function safeFetch(fetchURL) {
    while (true) {
        try {
            return await fetch(fetchURL);
        } catch {}
    }
}

// Clears unwanted runs from the queue
function cleanQueue(runsList, miscBool, levelsValueString) {
    if (levelsValueString == "full-game") {
        runsList = runsList.filter(run => run.level === null)
    } else if (levelsValueString == "levels") {
        runsList = runsList.filter(run => run.level !== null)
    }

    if (miscBool == false) {
        runsList = runsList.filter(run => run.category.data.miscellaneous == false)
    }
    return runsList
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
            let gameData = (await (await safeFetch(`https://speedrun.com/api/v1/games/${run.game}`)).json()).data
            typeString = "Run"
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
            if (run.level != null) {
                typeString = "Level " + typeString
            }

            // Time math :(
            let runTime = timeFormat(run.times.primary_t);

            let categoryName = run.category.data.name
            if (run.level != null) {
                let levelName = await fetchLevelName(run.level)
                categoryName = levelName + " " + categoryName
            }
            //builds embed for bot output
            const runEmbed = new EmbedBuilder()
            .setColor(0xFF00FF)
            .setTitle(`New ${typeString} in queue for ${gameData.names.international}`)
            .setURL(`${run.weblink}`)
            .addFields(
                { name: 'Description:', value: `${run.comment}` },
                { name: 'Runner:', value: `${run.players.data[0].names.international}`, inline: true },
                { name: 'Category:', value: `${categoryName}`, inline: true },
                { name: 'Time', value: `${runTime}`, inline: false },
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
                runStatus = (await (await safeFetch(`https://speedrun.com/api/v1/runs/${runID}`)).json()).data.status.status
            } catch {
                runStatus = undefined
            }
            if (!runStatus || runStatus !== "new") {
                tempArray.splice(tempArray.indexOf(runID), 1)
            }
        }
        messages[serverID] = tempArray
    }
    await fs.writeFile('./messages.json', JSON.stringify(messages));
}

// Formats times from an input of a number of seconds
function timeFormat(seconds) {
    let ms = String(seconds).split(".")[1]
    var date = new Date(0);
    date.setSeconds(seconds);
    var timeString = date.toISOString().substring(11, 19);
    if (ms != undefined) {
        timeString = `${timeString}.${ms}`
    }
    return timeString
}

client.login(secrets.token);