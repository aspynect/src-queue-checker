const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const { EmbedBuilder } = require('discord.js');
const fs = require('fs/promises')
const secrets = require('./secrets.json');
var config = require('./config.json');
var messages = require('./messages.json')




client.on('ready', async () => {
    
    console.log(`Logged in as ${client.user.tag}!`);
    setInterval(async () => {
        console.log("checking queue")
        await checkQueue();
    }, 60000);
    setInterval(() => {
        flushLogs();
    }, 86400000)
});

client.on('interactionCreate', async interaction => {
    if (interaction.commandName === 'config') {
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
        let guildConfig = config[interaction.guild.id]
        if (interaction.options.getString('leaderboards') || interaction.options.getBoolean('records') || interaction.options.getBoolean('misc') || interaction.options.getString('scope') || interaction.options.getChannel('channel')) {
            if(interaction.options.getString('leaderboards')) {
                let gamesArray = interaction.options.getString('leaderboards').split(',');
                for (const games of gamesArray) {
                    //TODO get game ids here
                }
                guildConfig.games = ""

            }
            if(interaction.options.getBoolean('records')) {
                guildConfig.onlyRecords = interaction.options.getBoolean('records');
            }
            if(interaction.options.getBoolean('misc')) {
                guildConfig.misc = interaction.options.getBoolean('misc');
            }
            if(interaction.options.getString('scope')) {
                guildConfig.scope = interaction.options.getString('scope');
            }
            if(interaction.options.getString('scope') || interaction.options.getChannel('channel')) {
                interactionChannel = interaction.options.getChannel('channel')
                guildConfig.channel = interactionChannel.id;
            }
            config[interaction.guild.id] = guildConfig
            await fs.writeFile('./config.json', JSON.stringify(config));
        }
        let gamesList = "" 
        for (const game of guildConfig.games) {
            let gameInfo = await (await fetch(`https://speedrun.com/api/v1/games/${game}`)).json.data
            console.log(gameInfo)
            gamesList = gameInfo.names.international + "(" + gameInfo.abbreviation + "), " + gamesList
        }
        gamesList = gamesList.slice(0,-2)
        if (!config.games) {
            gamesList = "No Games"
        }

        const runEmbed = new EmbedBuilder()
        .setColor(0xFF00FF)
        .setTitle(`Server Configuration`)
        .setDescription('Bot configuration for the current server')
        .addFields(
            { name: 'Leaderboards:', value: `${gamesList}` },
            { name: 'Only Records:', value: `${guildConfig.onlyRecords}`, inline: true },
            { name: 'Miscellaneous:', value: `${guildConfig.misc}`, inline: true },
            { name: 'Scope:', value: `${guildConfig.scope}`, inline: true },
            { name: 'Channel:', value: `<#${interaction.channel.id}>` }
            )
        .setTimestamp()

        await interaction.reply({embeds: [runEmbed]});
    }

    if (interaction.commandName === 'ping') {
        await interaction.reply({content: `h`, ephemeral: true});
    }
})


async function checkQueue() {
    for (const guildID of client.guilds.cache.keys()) {
        if (!config[guildID].channel) {
            continue;
        }
        let guildConfig =  config[guildID]
        if (Object.keys(config).includes(guildID)) {
            for (const gameID of guildConfig.games) {
                let queueData = await fetchQueue(gameID);

                if (guildConfig.onlyRecords === 1) {
                    let recordsData = await fetchRecords(gameID, guildConfig.scope, guildConfig.misc);

                    for (const run of queueData) {
                        if(run.time.primary_t < recordsData.get(run.category)) {
                            logRun(run, guildID, "Record");
                        }
                    }
                } else {
                    for (const run of queueData) {
                        logRun(run, guildID, "Run")
                    }
                }
            }
        } else {
            console.log(`Server ${guildID} has no config`);
        }
    }
}

async function flushLogs() {
    for (serverID of messages.keys()) {
        let tempArray = messages[serverID].copy();
        for (runID of messages[serverID]) {
            if (await (await fetch(`https://speedrun.com/api/v1/runs/${runID}`)).json.data.status === "verified") {
                tempArray.splice(tempArray.indexOf(runID), 1)
            }
        }
        messages[serverID] = tempArray
    }
    messages = tempArray
    await fs.writeFile('./messages.json', JSON.stringify(messages));
}


async function fetchQueue(gameID) {
    let runs = []
    let offset = 0

    while(true) {
        let tempRuns = await actuallyFetchQueue(gameID, offset);

        if (!tempRuns) {
            console.log(`Queue failed to load for ${gameID}`)
            return undefined;
        }

        if (tempRuns.length === 0) {
            break;
        }

        runs.concat(tempRuns.data);
        offset += 200
    }
    return runs;
}

async function actuallyFetchQueue(gameID, offset) {
    try {
        return await (await fetch(`https://speedrun.com/api/v1/runs?game=${gameID}&status=new&offset=${offset}&max=200&embed=players,category`)).json();
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

async function fetchRecords(gameID, scope, misc) {
    try {
        let recordObject = await (await fetch(`https://speedrun.com/api/v1/games/${gameID}/records?miscellaneous=${misc}&scope=${scope}&top=1&max=200`)).json();

        const recordMap = new Map();

        for (const record of recordObject.data) {
            recordMap.set(record.category, record.runs[0].times.primary_t)
        }

        return recordMap;
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

async function logRun(run, guildID, runType) {
    if(!messages[guildID]) {
        messages[guildID] = []
    }
    if (!messages.guildID.includes(run.id)) {
        let reportChannel = await client.guilds.cache.get(guildID).channels.cache.get(config[guildID].channel);
        let gameData = await (await fetch(`https://speedrun.com/api/v1/games/${run.game}`)).json.data.data
        
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
    
        const runEmbed = new EmbedBuilder()
        .setColor(0xFF00FF)
        .setTitle(`New ${runType} in queue for ${gameData.names.international}`)
        .setURL(`${run.weblink}`)
        .addFields(
            { name: 'Description:', value: `${run.comment}` },
            { name: '\u200B', value: '\u200B' },
            { name: 'Runner:', value: `${run.players.data[0].names.international}`, inline: true },
            { name: 'Category:', value: `${run.category.data.name}`, inline: true },
            { name: 'Time', value: `${tempTime}`, inline: true },
            )
        .setTimestamp()
    
        await reportChannel.send({embeds: [runEmbed]});

        messages.guildID.push(`${run.id}`)

        await fs.writeFile('./messages.json', JSON.stringify(messages));
    }
}

client.login(secrets.token);