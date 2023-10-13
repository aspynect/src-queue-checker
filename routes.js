const {REST, Routes, ApplicationCommandOptionType, PermissionFlagsBits} = require('discord.js');
const secrets = require('./secrets.json');


const commands = [
    {
        name: 'ping',
        description: 'h',
    },
    {
        name: 'config',
        description: "Configure this bot's behavior",
        options: [
            {
                name:"leaderboards",
                description:"Leaderboards to report runs from, abbreviations separated by commas. ex: smo,smoce",
                type:ApplicationCommandOptionType.String
            },
            {
                name:"records",
                description:"Only report world records?",
                type:ApplicationCommandOptionType.Boolean
            },
            {
                name:"misc",
                description:"Report runs from miscellaneous categories?",
                type:ApplicationCommandOptionType.Boolean
            },
            {
                name:"scope",
                description:"Scope of runs to report?",
                type:ApplicationCommandOptionType.String,
                choices: [
                    {name:"All Runs", value:"all"},
                    {name:"Level Runs", value:"levels"},
                    {name:"Full-game Runs", value:"full-game"}
                ]
            },
            {
                name:"channel",
                description:"What channel to report runs in?",
                type:ApplicationCommandOptionType.Channel,
            }
        ],
        default_member_permissions: 0x0000000000000020
    }
];

const rest = new REST({ version: '10' }).setToken(secrets.token);

(async () => {
    try {
        console.log("Started routing");
        await rest.put(Routes.applicationCommands(secrets.appID), { body: commands });
        console.log("Routing complete");
    } catch (error) {
        console.error(error);
    }
})();