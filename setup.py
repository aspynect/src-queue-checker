# Create files: secrets,messages,config
import json
blank = json.dumps({})
secrets = {}

f = open("config.json", "x")
f.write(blank)
f.close()

f = open("messages.json", "x")
f.write(blank)
f.close()

f = open("secrets.json", "x")
token = input("Enter your application token: ")
appID = input("Enter your Application ID: ")
secrets["token"] = token
secrets["appID"] = appID
f.write(json.dumps(secrets))
f.close()