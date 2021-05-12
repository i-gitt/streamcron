const https = require('follow-redirects').https;
const fs = require('fs');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
var config = require('./settings.json');
const ytpath = '/embed/live_stream?autoplay=1&channel=';
const twitchpath = '/kraken/streams/?channel=';

var channels = config.channelinventory.reduce(function(ids, obj){
    if(obj.type == "twitch"){
        ids.push(obj.id);
    }
    return ids;
}, []);

var ytchannels = config.channelinventory.reduce(function(ids, obj){
    if(obj.type == "yt"){
        ids.push(obj.id);
    }
    return ids;
}, []);

var options = {
  host: 'api.twitch.tv',
  path: twitchpath+channels.join(),
  port: 443,
  headers: {'Client-ID': config.apikey ,'Accept': 'application/vnd.twitchtv.v5+json'}
};

var ytoptions = {
  host: 'youtube.com',
  port: 443,
  method:"HEAD",
  followAllRedirects: true,
  headers:{Cookie: "CONSENT=YES+cb.20210420-15-p1.en-GB+FX+634" }
 
};
var json ={"streams":[]};


function getTwitchData(callback) {
	try {
		ra = fs.readFileSync(config.filename);
		json = JSON.parse(ra);
	} catch (err) {
		json={"streams":[]};
	}

	const req = https.get(options, res => {
		let rawData = '';
		res.on('data', (chunk) => { rawData += chunk; });
		res.on('end', error => {callback(JSON.parse(rawData))});
	})
	req.end();
}

getTwitchData(checkYT);

function setYTItem(id,test){
	yt ={};	
	yt._id = id;
	yt.type = "YT";
	yt.channel={}
	yt.preview={}
	yt.channel.logo = test.embedPreview.thumbnailPreviewRenderer.videoDetails.embeddedPlayerOverlayVideoDetailsRenderer.channelThumbnail.thumbnails[0].url;
	yt.channel.url = "https://youtube.com/channel/"+id+"/live";
	yt.channel['status'] = test.embedPreview.thumbnailPreviewRenderer.title.runs[0].text;
	yt.channel._id = id;
	yt.preview.medium = test.embedPreview.thumbnailPreviewRenderer.defaultThumbnail.thumbnails[4].url;
	yt.channel.name = test.embedPreview.thumbnailPreviewRenderer.videoDetails.embeddedPlayerOverlayVideoDetailsRenderer.expandedRenderer.embeddedPlayerOverlayVideoDetailsExpandedRenderer.title.runs[0].text;
	yt.iframe = "https://youtube.com"+ytpath+id;
	return yt;						
}

function checkYT(raw){	
	var count=0;
	ytchannels.forEach(item  =>{
		ytoptions.path=ytpath+item;
		const req = https.request(ytoptions, function(res){
			res.setEncoding('utf8');
			if(parseInt(res.headers["content-length"])>32000){
				ytoptions.method="GET";
				ytoptions.path=ytpath+item;
				const t2 = https.request(ytoptions, function(re){
					let data = '';
					re.on('data', chunk => {
						data += chunk;
					});
					re.on('end', () => {
						tmptxt=extractJSON(data);
						tempjson = JSON.parse(tmptxt[0]["PLAYER_VARS"]["embedded_player_response"]);
						count++;
						raw =YTcallback(setYTItem(item,tempjson),raw,count);
					});
				});
				t2.end();
				
			} else{
				count++;
				raw = YTcallback(null,raw);	
			}
		});

		req.end();
	});	
	
}

function YTcallback(yt,raw,count){
	if(yt!=null){
		raw.streams.push(yt);
		
	}
	if(count==ytchannels.length){
		fs.writeFileSync(config.filename, JSON.stringify(raw));
		check(json,raw);
	}
	
	return raw;
}


function extractJSON(str) {
    var firstOpen, firstClose, candidate;
    firstOpen = str.indexOf('ytcfg.set({', firstOpen + 1);
    do {
	firstClose = str.lastIndexOf('})');
        if(firstClose <= firstOpen) {
            return null;
        }
        do {
            candidate = str.substring(firstOpen, firstClose + 1);
            try {
                var res = JSON.parse(candidate);
                return [res, firstOpen, firstClose + 1];
            }
            catch(e) {
            }
            firstClose = str.substr(0, firstClose).lastIndexOf('})');
        } while(firstClose > firstOpen);
        firstOpen = str.indexOf('{', firstOpen + 1);
    } while(firstOpen != -1);
}


function check(json,now){
	try {
		arr=[];
		itm="";
		
		now.streams.forEach(item => {
			tempitem = config.channelinventory.find(chan => chan.id == item.channel._id )
			item.hook = tempitem.hook;
			if(json.streams.length>0){
				found =false
				json.streams.forEach(olditem => {
					
					if(olditem._id == item._id){
						found =true;
						itm= null;
					} else{ if(found==false)itm = item;
					}
				});
				if(found==false) arr.push(itm);
			} else {
				arr.push(item);
			}
		});
	} catch (err) {
		console.log(err);
		rawdata="";
		now="";
	}

	arr.forEach(it => {
		sendWebhook(it,config.showimage);
	});
	
}

function sendWebhook(item,imag = false){
	if(config.defaulturl != null){
		tmpurl = config.defaulturl;
	} else {
		tmpurl = item.channel.url
	}
	const embed = new MessageBuilder()
	embed.setTitle(item.channel['status'])
	embed.setAuthor(item.channel.name, item.channel.logo, item.channel.url)
	embed.setURL(tmpurl)
	if(item.type !="YT"){
		embed.addField('Whats on', item.channel.game, true)
		embed.addField('Viewers', item.viewers,true)
	}
	embed.setColor(config.embedColor)
	embed.setThumbnail(item.channel.logo)
	if (imag)
		embed.setImage(item.preview.medium)
	embed.setFooter(config.footer.txt,config.footer.logo)
	
	embed.payload.content = "is live on "+tmpurl;
	for(i=0;i<item.hook.length;i++){
		console.log(item)
		hook = new Webhook(config.hooks[item.hook[i]]);
		hook.setUsername(item.channel.name);
		hook.send(embed);
	}
		
}
