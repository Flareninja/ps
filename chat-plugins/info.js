/**
 * Informational Commands
 * Pokemon Showdown - https://pokemonshowdown.com/
 *
 * These are informational commands. For instance, you can define the command
 * 'whois' here, then use it by typing /whois into Pokemon Showdown.
 *
 * For the API, see chat-plugins/COMMANDS.md
 *
 * @license MIT license
 */

const RESULTS_MAX_LENGTH = 10;
var http = require('http');
var fs = require('fs');
var geoip = require('geoip-lite');
var ipbans = fs.createWriteStream('config/ipbans.txt', { 
  'flags': 'a' 
}); 
 var badges = fs.createWriteStream('badges.txt', { 
  'flags': 'a' 
 }); 
  var badges = fs.createWriteStream('leaguebadges.txt', { 
  'flags': 'a' 
 }); 
 
 var request = require('request'); 
 var moment = require('moment'); 
geoip.startWatchingDataUpdate();
var urbanCache = {};
try {
	urbanCache = JSON.parse(fs.readFileSync('config/udcache.json', 'utf8'));
} catch (e) {}

function cacheUrbanWord (word, definition) {
	if (word.toString().length < 1) return;
	word = word.toLowerCase().replace(/ /g, '');
	urbanCache[word] = {"definition": definition, "time": Date.now()};
	fs.writeFile('config/urbancache.json', JSON.stringify(urbanCache));
}

var commands = exports.commands = {

	ip: 'whois',
	rooms: 'whois',
	alt: 'whois',
	alts: 'whois',
	whoare: 'whois',
	whois: function (target, room, user, connection, cmd) {
		if (room.id === 'staff' && !this.canBroadcast()) return;
		var targetUser = this.targetUserOrSelf(target, user.group === ' ');
		if (!targetUser) {
			return this.sendReply("User " + this.targetUsername + " not found.");
		}
		var showAll = (cmd === 'ip' || cmd === 'whoare' || cmd === 'alt' || cmd === 'alts');
		if (showAll && !user.can('lock') && targetUser !== user) {
			return this.errorReply("/alts - Access denied.");
		}

		var geo = geoip.lookup(targetUser.latestIp);
		var buf = '';
		var username = "<button class=\"astext\" name=\"parseCommand\" value=\"/user " + targetUser.name + "\"><b><font color=" + 
			hashColor(targetUser.userid) + ">" + Tools.escapeHTML(targetUser.name) + "</font></b></button>" + (!targetUser.connected ? ' <font color="gray"><em>(offline)</em></font>' : '');

		if (geo && geo.country && fs.existsSync('static/images/flags/' + geo.country.toLowerCase() + '.png')) {
				username += ' <img src="http://167.114.152.79:' + Config.port + '/images/flags/' + geo.country.toLowerCase() + '.png" height=10 title="' + geo.country + '">';
		}
		buf += username;

		if (Config.groups[targetUser.group] && Config.groups[targetUser.group].name) {
			buf += "<br />" + Config.groups[targetUser.group].name + " (" + targetUser.group + ")";
		}
		if (targetUser.isSysop) {
			buf += "<br />(Pok&eacute;mon Showdown System Operator)";
		}
		if (!targetUser.registered) {
			buf += "<br />(Unregistered)";
		}

		if (!targetUser.lastActive) targetUser.lastActive = Date.now();

		var seconds = Math.floor(((Date.now() - targetUser.lastActive) / 1000));
		var minutes = Math.floor((seconds / 60));
		var hours = Math.floor((minutes / 60));

		var secondsWord = (((seconds % 60) > 1 || (seconds % 60) == 0) ? 'seconds' : 'second');
		var minutesWord = (((minutes % 60) > 1 || (minutes % 60) == 0) ? 'minutes' : 'minute');
		var hoursWord = ((hours > 1 || hours == 0) ? 'hours' : 'hour');

		if (minutes < 1) {
			buf += '<br />' + (targetUser.awayName ? '|raw|<b><font color="orange">Away for: </font></b>' : "Idle for: ") + seconds + ' ' + secondsWord;
		}
		if (minutes > 0 && minutes < 60) {
			buf += '<br />' + (targetUser.awayName ? '|raw|<b><font color="orange">Away for: </font></b>' : "Idle for: ") + minutes + ' ' + minutesWord + ' ' + (seconds % 60) + ' ' + secondsWord;
		}
		if (hours > 0) {
			buf += '<br />' + (targetUser.awayName ? '|raw|<b><font color="orange">Away for: </font></b>' : "Idle for: ") + hours + ' ' + hoursWord + ' ' + (minutes % 60) + ' ' + minutesWord;
		}

		var publicrooms = "";
		var hiddenrooms = "";
		var privaterooms = "";
		for (var i in targetUser.roomCount) {
			if (i === 'global') continue;
			var targetRoom = Rooms.get(i);

			var output = (targetRoom.auth && targetRoom.auth[targetUser.userid] ? targetRoom.auth[targetUser.userid] : '') + '<a href="/' + i + '" room="' + i + '">' + i + '</a>';
			if (targetRoom.isPrivate === true) {
				if (privaterooms) privaterooms += " | ";
				privaterooms += output;
			} else if (targetRoom.isPrivate) {
				if (hiddenrooms) hiddenrooms += " | ";
				hiddenrooms += output;
			} else {
				if (publicrooms) publicrooms += " | ";
				publicrooms += output;
			}
		}
		buf += '<br />Rooms: ' + (publicrooms || '<em>(no public rooms)</em>');

		if (!showAll) {
			return this.sendReplyBox(buf);
		}
		buf += '<br />';
		if (user.can('alts', targetUser) || user.can('alts') && user === targetUser) {
			var alts = targetUser.getAlts(true);
			var output = Object.keys(targetUser.prevNames).join(", ");
			if (output) buf += "<br />Previous names: " + Tools.escapeHTML(output);

			for (var j = 0; j < alts.length; ++j) {
				var targetAlt = Users.get(alts[j]);
				if (!targetAlt.named && !targetAlt.connected) continue;
				if (targetAlt.group === '~' && user.group !== '~') continue;

				buf += '<br />Alt: <span class="username">' + Tools.escapeHTML(targetAlt.name) + '</span>' + (!targetAlt.connected ? " <em style=\"color:gray\">(offline)</em>" : "");
				output = Object.keys(targetAlt.prevNames).join(", ");
				if (output) buf += "<br />Previous names: " + output;
			}
			if (targetUser.locked) {
				buf += '<br />Locked: ' + targetUser.locked;
				switch (targetUser.locked) {
				case '#dnsbl':
					buf += " - IP is in a DNS-based blacklist";
					break;
				case '#range':
					buf += " - IP or host is in a temporary range-lock";
					break;
				case '#hostfilter':
					buf += " - host is permanently locked for being a proxy";
					break;
				}
			}
			if (targetUser.semilocked) {
				buf += '<br />Semilocked: ' + targetUser.semilocked;
			}
		}
		if ((user.can('ip', targetUser) || user === targetUser)) {
			var ips = Object.keys(targetUser.ips);
			buf += "<br /> IP" + ((ips.length > 1) ? "s" : "") + ": " + ips.join(", ") +
					(user.group !== ' ' && targetUser.latestHost ? "<br />Host: " + Tools.escapeHTML(targetUser.latestHost) : "");
			if (geo && geo.country) buf += "<br />Country: " + geo.country;
			if (geo && geo.region) buf += "<br />Region: " + geo.region;
			if (geo && geo.city) buf += "<br />City: " + geo.city;
		}
		if ((user === targetUser || user.can('alts')) && hiddenrooms) {
			buf += '<br />Hidden rooms: ' + hiddenrooms;
		}
		if ((user === targetUser || user.hasConsoleAccess(connection)) && privaterooms) {
			buf += '<br />Private rooms: ' + privaterooms;
		}
		this.sendReplyBox(buf);
	},
	whoishelp: ["/whois - Get details on yourself: alts, group, IP address, and rooms.",
		"/whois [username] - Get details on a username: alts (Requires: % @ & ~), group, IP address (Requires: @ & ~), and rooms."],
events: 'activities',
    activities: function(target, room, user) {
        if (!this.canBroadcast()) return;
        this.sendReplyBox('<center><font size="3" face="comic sans ms">Fireball Activities:</font></center></br>' +
            '★ <b>Tournaments</b> - Here on Fireball, we have a tournaments script that allows users to partake in several different tiers.  For a list of tour commands do /tour.  Ask in the lobby for a voice (+) or up to start one of these if you\'re interesrted!<br>' +
            '★ <b>Hangmans</b> - We have a hangans script that allows users to  partake in a "hangmans" sort of a game.  For a list of hangmans commands, do /hh.  As a voice (+) or up in the lobby to start one of these if interested.<br>' +
            '★ <b>Leagues</b> - If you click the "join room page" to the upper right (+), it will display a list of rooms we have.  Several of these rooms are 3rd party leagues of Gold; join them to learn more about each one!<br>' +
            '★ <b>Battle</b> - By all means, invite your friends on here so that you can battle with each other!  Here on Gold, we are always up to date on our formats, so we\'re a great place to battle on!<br>' +
            '★ <b>Chat</b> - Fireball is full of great people in it\'s community and we\'d love to have you be apart of it!<br>' +
            '★ <b>Learn</b> - Are you new to Pokemon?  If so, then feel FREE to ask the lobby any questions you might have!<br>' +
            '★ <b>Shop</b> - Do /shop to learn about where your Gold Bucks can go! <br>' +
            '★ <b>Plug.dj</b> - Come listen to music with us! Click <a href="http://plug.dj/">here</a> to start!<br>' +
            '<i>--PM staff (%, @, &, ~) any questions you might have!</i>');
    },

removebadge: function(target, room, user) {
        if (!this.can('hotpatch')) return false;
        target = this.splitTarget(target);
        var targetUser = this.targetUser;
        if (!target) return this.sendReply('/removebadge [user], [badge] - Removes a badge from a user.');
        if (!targetUser) return this.sendReply('There is no user named ' + this.targetUsername + '.');
        var self = this;
        var type_of_badges = ['admin', 'bot', 'dev', 'vip', 'artist', 'mod', 'leader', 'champ', 'creator', 'comcun', 'twinner', 'goodra', 'league', 'fgs'];
        if (type_of_badges.indexOf(target) > -1 == false) return this.sendReply('The badge ' + target + ' is not a valid badge.');
        fs.readFile('badges.txt', 'utf8', function(err, data) {
            if (err) console.log(err);
            var match = false;
            var currentbadges = '';
            var row = ('' + data).split('\n');
            var line = '';
            for (var i = row.length; i > -1; i--) {
                if (!row[i]) continue;
                var split = row[i].split(':');
                if (split[0] == targetUser.userid) {
                    match = true;
                    currentbadges = split[1];
                    line = row[i];
                }
            }
            if (match == true) {
                if (currentbadges.indexOf(target) > -1 == false) return self.sendReply(currentbadges); //'The user '+targetUser+' does not have the badge.');
                var re = new RegExp(line, 'g');
                currentbadges = currentbadges.replace(target, '');
                var newdata = data.replace(re, targetUser.userid + ':' + currentbadges);
                fs.writeFile('badges.txt', newdata, 'utf8', function(err, data) {
                    if (err) console.log(err);
                    return self.sendReply('You have removed the badge ' + target + ' from the user ' + targetUser + '.');
                });
            } else {
                return self.sendReply('There is no match for the user ' + targetUser + '.');
            }
        });
    },
    givebadge: function(target, room, user) {
        if (!this.can('hotpatch')) return false;
        target = this.splitTarget(target);
        var targetUser = this.targetUser;
        if (!targetUser) return this.sendReply('There is no user named ' + this.targetUsername + '.');
        if (!target) return this.sendReply('/givebadge [user], [badge] - Gives a badge to a user. Requires: &~');
        var self = this;
        var type_of_badges = ['admin', 'bot', 'dev', 'vip', 'mod', 'artist', 'leader', 'champ', 'creator', 'comcun', 'twinner', 'league', 'fgs'];
        if (type_of_badges.indexOf(target) > -1 == false) return this.sendReply('Ther is no badge named ' + target + '.');
        fs.readFile('badges.txt', 'utf8', function(err, data) {
            if (err) console.log(err);
            var currentbadges = '';
            var line = '';
            var row = ('' + data).split('\n');
            var match = false;
            for (var i = row.length; i > -1; i--) {
                if (!row[i]) continue;
                var split = row[i].split(':');
                if (split[0] == targetUser.userid) {
                    match = true;
                    currentbadges = split[1];
                    line = row[i];
                }
            }
            if (match == true) {
                if (currentbadges.indexOf(target) > -1) return self.sendReply('The user ' + targerUser + ' already has the badge ' + target + '.');
                var re = new RegExp(line, 'g');
                var newdata = data.replace(re, targetUser.userid + ':' + currentbadges + target);
                fs.writeFile('badges.txt', newdata, function(err, data) {
                    if (err) console.log(err);
                    self.sendReply('You have given the badge ' + target + ' to the user ' + targetUser + '.');
                    targetUser.send('You have recieved the badge ' + target + ' from the user ' + user.userid + '.');
                    room.addRaw(targetUser + ' has recieved the ' + target + ' badge from ' + user.name);
                });
            } else {
                fs.appendFile('badges.txt', '\n' + targetUser.userid + ':' + target, function(err) {
                    if (err) console.log(err);
                    self.sendReply('You have given the badge ' + target + ' to the user ' + targetUser + '.');
                    targetUser.send('You have recieved the badge ' + target + ' from the user ' + user.userid + '.');
                });
            }
        })
    },
    badgelist: function(target, room, user) {
        if (!this.canBroadcast()) return;
        var fgs = '<img src="http://www.smogon.com/media/forums/images/badges/forummod_alum.png" title="Former Server Staff">';
        var admin = '<img src="http://www.smogon.com/media/forums/images/badges/sop.png" title="Server Administrator">';
        var dev = '<img src="http://www.smogon.com/media/forums/images/badges/factory_foreman.png" title="Server Developer">';
        var creator = '<img src="http://www.smogon.com/media/forums/images/badges/dragon.png" title="Server Creator">';
        var comcun = '<img src="http://www.smogon.com/media/forums/images/badges/cc.png" title="Community Contributor">';
        var leader = '<img src="http://www.smogon.com/media/forums/images/badges/aop.png" title="Server Leader">';
        var mod = '<img src="http://www.smogon.com/media/forums/images/badges/pyramid_king.png" title="Exceptional Staff Member">';
        var league = '<img src="http://www.smogon.com/media/forums/images/badges/forumsmod.png" title="Successful Room Founder">';
        var champ = '<img src="http://www.smogon.com/media/forums/images/badges/forumadmin_alum.png" title="Goodra League Champion">';
        var artist = '<img src="http://www.smogon.com/media/forums/images/badges/ladybug.png" title="Artist">';
        var twinner = '<img src="http://www.smogon.com/media/forums/images/badges/spl.png" title="Badge Tournament Winner">';
        var vip = '<img src="http://www.smogon.com/media/forums/images/badges/zeph.png" title="VIP">';
        var bot = '<img src="http://www.smogon.com/media/forums/images/badges/mind.png" title="Fireball Bot Hoster">';
        return this.sendReplyBox('<b>List of FIreball Badges</b>:<br>' + fgs + '  ' + admin + '    ' + dev + '  ' + creator + '   ' + comcun + '    ' + mod + '    ' + leader + '    ' + league + '    ' + champ + '    ' + artist + '    ' + twinner + '    ' + vip + '    ' + bot + ' <br>--Hover over them to see the meaning of each.<br>--Get a badge and get a FREE custom avatar!<br>--Click <a href="http://goldserver.weebly.com/badges.html">here</a> to find out more about how to get a badge.');
    },
    roomleader: function(target, room, user) {
        if (!room.chatRoomData) {
            return this.sendReply("/roomleader - This room is't designed for per-room moderation to be added.");
        }
        var target = this.splitTarget(target, true);
        var targetUser = this.targetUser;
        if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' is not online.");
        if (!room.founder || user.userid != room.founder && !this.can('hotpatch')) return false;
        if (!room.auth) room.auth = room.chatRoomData.auth = {};
        var name = targetUser.name;
        room.auth[targetUser.userid] = '&';
        //room.founder = targetUser.userid;
        this.addModCommand('' + name + ' was appointed to Room Leader by ' + user.name + '.');
        room.onUpdateIdentity(targetUser);
        //room.chatRoomData.leaders = room.founder;
        Rooms.global.writeChatRoomData();
    },
    deroomleader: function(target, room, user) {
        if (!room.auth) {
            return this.sendReply("/roomdeowner - This room isn't designed for per-room moderation");
        }
        target = this.splitTarget(target, true);
        var targetUser = this.targetUser;
        var name = this.targetUsername;
        var userid = toId(name);
        if (!userid || userid === '') return this.sendReply("User '" + name + "' does not exist.");
        if (room.auth[userid] !== '&') return this.sendReply("User '" + name + "' is not a room leader.");
        if (!room.founder || user.userid != room.founder && !this.can('hotpatch')) return false;
        delete room.auth[userid];
        this.sendReply('(' + name + ' is no longer Room Leader.)');
        if (targetUser) targetUser.updateIdentity();
        if (room.chatRoomData) {
            Rooms.global.writeChatRoomData();
        }
    },
    badges: 'badge',
    badge: function(target, room, user) {
        if (!this.canBroadcast()) return;
        if (target == '') target = user.userid;
        target = this.splitTarget(target);
        var targetUser = this.targetUser;
        var matched = false;
        if (!targetUser) return false;
        var fgs = '<img src="http://www.smogon.com/media/forums/images/badges/forummod_alum.png" title="Former Gold Staff">';
        var admin = '<img src="http://www.smogon.com/media/forums/images/badges/sop.png" title="Server Administrator">';
        var dev = '<img src="http://www.smogon.com/media/forums/images/badges/factory_foreman.png" title="Gold Developer">';
        var creator = '<img src="http://www.smogon.com/media/forums/images/badges/dragon.png" title="Server Creator">';
        var comcun = '<img src="http://www.smogon.com/media/forums/images/badges/cc.png" title="Community Contributor">';
        var leader = '<img src="http://www.smogon.com/media/forums/images/badges/aop.png" title="Server Leader">';
        var mod = '<img src="http://www.smogon.com/media/forums/images/badges/pyramid_king.png" title="Exceptional Staff Member">';
        var league = '<img src="http://www.smogon.com/media/forums/images/badges/forumsmod.png" title="Successful League Owner">';
        var srf = '<img src="http://www.smogon.com/media/forums/images/badges/forumadmin_alum.png" title="Goodra League Champion">';
        var artist = '<img src="http://www.smogon.com/media/forums/images/badges/ladybug.png" title="Artist">';
        var twinner = '<img src="http://www.smogon.com/media/forums/images/badges/spl.png" title="Badge Tournament Winner">';
        var vip = '<img src="http://www.smogon.com/media/forums/images/badges/zeph.png" title="VIP">';
        var bot = '<img src="http://www.smogon.com/media/forums/images/badges/mind.png" title="Gold Bot Hoster">';
        var self = this;
        fs.readFile('badges.txt', 'utf8', function(err, data) {
            if (err) console.log(err);
            var row = ('' + data).split('\n');
            var match = false;
            var badges;
            for (var i = row.length; i > -1; i--) {
                if (!row[i]) continue;
                var split = row[i].split(':');
                if (split[0] == targetUser.userid) {
                    match = true;
                    currentbadges = split[1];
                }
            }
            if (match == true) {
                var badgelist = '';
                if (currentbadges.indexOf('fgs') > -1) badgelist += ' ' + fgs;
                if (currentbadges.indexOf('admin') > -1) badgelist += ' ' + admin;
                if (currentbadges.indexOf('dev') > -1) badgelist += ' ' + dev;
                if (currentbadges.indexOf('creator') > -1) badgelist += ' ' + creator;
                if (currentbadges.indexOf('comcun') > -1) badgelist += ' ' + comcun;
                if (currentbadges.indexOf('leader') > -1) badgelist += ' ' + leader;
                if (currentbadges.indexOf('mod') > -1) badgelist += ' ' + mod;
                if (currentbadges.indexOf('league') > -1) badgelist += ' ' + league;
                if (currentbadges.indexOf('champ') > -1) badgelist += ' ' + champ;
                if (currentbadges.indexOf('artist') > -1) badgelist += ' ' + artist;
                if (currentbadges.indexOf('twinner') > -1) badgelist += ' ' + twinner;
                if (currentbadges.indexOf('vip') > -1) badgelist += ' ' + vip;
                if (currentbadges.indexOf('bot') > -1) badgelist += ' ' + bot;
                self.sendReplyBox(targetUser.userid + "'s badges: " + badgelist);
                room.update();
            } else {
                self.sendReplyBox('User ' + targetUser.userid + ' has no badges.');
                room.update();
            }
        });
    },


 

 
removelb:'removeleaguebadge',
removeleaguebadge: function(target, room, user) {
        

        target = this.splitTarget(target);
        var targetUser = this.targetUser;
        if (!target) return this.sendReply('/removelb [user], [badge] - Removes a Leaguebadge from a user.Requires: #~');
        if (!targetUser) return this.sendReply('There is no user named ' + this.targetUsername + '.');
        var self = this;
        var type_of_badges = ['cascadebadge', 'stormbadge', 'thunderbadge', 'fogbadge', 'hivebadge', 'volcanobadge', 'marshbadge', 'zephyrbadge', 'rainbowbadge', 'soulbadge', 'plainbadge ', 'goodra', 'earthbadge', 'boulderbadge'];
        if (type_of_badges.indexOf(target) > -1 == false) return this.sendReply('The badge ' + target + ' is not a valid badge.');
        fs.readFile('leaguebadges.txt', 'utf8', function(err, data) {
            if (err) console.log(err);
            var match = false;
            var currentbadges = '';
            var row = ('' + data).split('\n');
            var line = '';
            for (var i = row.length; i > -1; i--) {
                if (!row[i]) continue;
                var split = row[i].split(':');
                if (split[0] == targetUser.userid) {
                    match = true;
                    currentbadges = split[1];
                    line = row[i];
                }
            }
            if (match == true) {
                if (currentbadges.indexOf(target) > -1 == false) return self.sendReply(currentbadges); //'The user '+targetUser+' does not have the badge.');
                var re = new RegExp(line, 'g');
                currentbadges = currentbadges.replace(target, '');
                var newdata = data.replace(re, targetUser.userid + ':' + currentbadges);
                fs.writeFile('leaguebadges.txt', newdata, 'utf8', function(err, data) {
                    if (err) console.log(err);
                    return self.sendReply('You have removed the badge ' + target + ' from the user ' + targetUser + '.');
                });
            } else {
                return self.sendReply('There is no match for the user ' + targetUser + '.');
            }
        });
    },
         givelb:'giveleaguebadge',
    giveleaguebadge: function(target, room, user) {
        
     if (!user.can('declare',null,room)) return this.sendReply('/givelb - Access denied.');
     if (room.id !== 'lobby')return this.errorReply("This room doesn't support league badge.. If u want league badge for this room buy one from the shop");


        target = this.splitTarget(target);
        var targetUser = this.targetUser;
        if (!targetUser) return this.sendReply('There is no user named ' + this.targetUsername + '.');
        if (!target) return this.sendReply('/givelb [user], [badge] - Gives a Leaguebadge to a user. Requires: &~');
        var self = this;
        var type_of_badges = ['cascadebadge', 'stormbadge', 'thunderbadge', 'fogbadge', 'volcanobadge', 'hivebadge', 'marshbadge', 'zephyrbadge', 'rainbowbadge', 'soulbadge', 'plainbadge ', 'earthbadge', 'boulderbadge'];
        if (type_of_badges.indexOf(target) > -1 == false) return this.sendReply('Ther is no badge named ' + target + '.');
        fs.readFile('leaguebadges.txt', 'utf8', function(err, data) {
            if (err) console.log(err);
            var currentbadges = '';
            var line = '';
            var row = ('' + data).split('\n');
            var match = false;
            for (var i = row.length; i > -1; i--) {
                if (!row[i]) continue;
                var split = row[i].split(':');
                if (split[0] == targetUser.userid) {
                    match = true;
                    currentbadges = split[1];
                    line = row[i];
                }
            }
            if (match == true) {
                if (currentbadges.indexOf(target) > -1) return self.sendReply('The user ' + targerUser + ' already has the badge ' + target + '.');
                var re = new RegExp(line, 'g');
                var newdata = data.replace(re, targetUser.userid + ':' + currentbadges + target);
                fs.writeFile('leaguebadges.txt', newdata, function(err, data) {
                    if (err) console.log(err);
                    self.sendReply('You have given the leaguebadge ' + target + ' to the user ' + targetUser + '.');
                    targetUser.send('You have recieved the leaguebadge ' + target + ' from the user ' + user.userid + '.');
                    room.addRaw(targetUser + ' has recieved the ' + target + ' badge from ' + user.name);
                });
            } else {
                fs.appendFile('leaguebadges.txt', '\n' + targetUser.userid + ':' + target, function(err) {
                    if (err) console.log(err);
                    self.sendReply('You have given the leaguebadge ' + target + ' to the user ' + targetUser + '.');
                    targetUser.send('You have recieved the leaguebadge ' + target + ' from the user ' + user.userid + '.');
                });
            }
        })
    },
         lblist:'leaguebadgelist',
    leaguebadgelist: function(target, room, user) {
        if (!this.canBroadcast()) return;
        var boulderbadge = '<img src= "http://vignette1.wikia.nocookie.net/pokemon/images/2/24/Boulderbadge.png/revision/latest?cb=20100418182312"height="20" width="20" title="Rock GymLeader 1G">';
        var cascadebadge = '<img src= "http://vignette4.wikia.nocookie.net/pokemon/images/4/4d/Cascadebadge.png/revision/latest?cb=20140907085215"height="20" width="20" title="Water Badge 1G">';
        var thunderbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/a/a8/Thunderbadge.png/revision/latest?cb=20100418182457"height="20" width="20"  title="Thunder badge 1G">';
        var rainbowbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/b/b5/Rainbow_Badge.png/revision/latest?cb=20141009005938"height="20" width="20"  title="rainbow badge 1G">';
        var soulbadge = '<img src="http://vignette1.wikia.nocookie.net/pokemon/images/6/64/Soulbadge.png/revision/latest?cb=20100418182548"height="20" width="20" title="Soul badge 1G">';
        var marshbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/1/1c/Marshbadge.png/revision/latest?cb=20100418182532"height="20" width="20" title="Marsh Leader 1G">';
        var volcanobadge = '<img src="http://vignette1.wikia.nocookie.net/pokemon/images/d/d9/Volcanobadge.png/revision/latest?cb=20081229171449"height="20" width="20" title="Volcano Badge 1G">';
        var earthbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/c/cc/Earthbadge.png/revision/latest?cb=20101029071826"height="20" width="20" title="Earth badge 1G">';
        var zephyrbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/b/b6/Zephyrbadge.png/revision/latest?cb=20081229171509"height="20" width="20" title="Zephyr Badge 2G">';
        var hivebadge = '<img src="http://vignette1.wikia.nocookie.net/pokemon/images/d/d0/Hivebadge.png/revision/latest?cb=20081229171030"height="20" width="20" title="Hive Badge 2G">';
        var plainbadge = '<img src="http://vignette4.wikia.nocookie.net/pokemon/images/4/42/Plainbadge.png/revision/latest?cb=20081229171221"height="20" width="20" title="Plane Badge 2G">';
        var fogbadge = '<img src="http://vignette3.wikia.nocookie.net/pokemon/images/4/4f/Fogbadge.png/revision/latest?cb=20081229170948"height="20" width="20" title="Fog Badge 2G">';
        var stormbadge = '<img src="http://vignette4.wikia.nocookie.net/pokemon/images/c/ca/Stormbadge.png/revision/latest?cb=20081229171417"height="20" width="20" title="Storm Badge 2G">';
        return this.sendReplyBox('<b>List of Fireball League Badges</b>:<br>' + boulderbadge + '  ' + cascadebadge + '    ' + thunderbadge + '  ' + rainbowbadge + '   ' + soulbadge + '    ' + volcanobadge + '    ' + marshbadge + '    ' + earthbadge + '    ' + zephyrbadge + '    ' + hivebadge + '    ' + plainbadge + '    ' + fogbadge + '    ' + stormbadge + ' <br>--Hover over them to see the meaning of each.<br>--Get a Leaguebadge while performing ur best in League rooms!<br>--Click <a href="http://fireball.weebly.com/badges.html">here</a> to find out more about how to get a badge.<a>More Badges r coming soon </a>');
    },
    
    lb: 'leaguebadge',
    lbadges: 'leaguebadge',
    leaguebadge: function(target, room, user) {
        if (!this.canBroadcast()) return;
        if (target == '') target = user.userid;
        target = this.splitTarget(target);
        var targetUser = this.targetUser;
        var matched = false;
        if (!targetUser) return false;
         var boulderbadge = '<img src="http://vignette1.wikia.nocookie.net/pokemon/images/2/24/Boulderbadge.png/revision/latest?cb=20100418182312"height="20" width="20" title="Rock GymLeader 1g">';
        var cascadebadge = '<img src= "http://vignette4.wikia.nocookie.net/pokemon/images/4/4d/Cascadebadge.png/revision/latest?cb=20140907085215"height="20" width="20"  title="Water Badge">';
        var thunderbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/a/a8/Thunderbadge.png/revision/latest?cb=20100418182457"height="20" width="20" title="Thunder badge">';
      var rainbowbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/b/b5/Rainbow_Badge.png/revision/latest?cb=20141009005938"height="20" width="20" title="rainbow badge">';
        var soulbadge = '<img src="http://vignette1.wikia.nocookie.net/pokemon/images/6/64/Soulbadge.png/revision/latest?cb=20100418182548"height="20" width="20" title="Soul badge 1G">';
        var marshbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/1/1c/Marshbadge.png/revision/latest?cb=20100418182532"height="20" width="20" title="Marsh Leader 1G">';
        var volcanobadge = '<img src="http://vignette1.wikia.nocookie.net/pokemon/images/d/d9/Volcanobadge.png/revision/latest?cb=20081229171449"height="20" width="20" title="Volcano Badge 1G">';
        var earthbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/c/cc/Earthbadge.png/revision/latest?cb=20101029071826"height="20" width="20" title="Earth badge 1G">';
        var zephyrbadge = '<img src="http://vignette2.wikia.nocookie.net/pokemon/images/b/b6/Zephyrbadge.png/revision/latest?cb=20081229171509"height="20" width="20" title="Zephyr Badge">';
        var hivebadge = '<img src="http://vignette1.wikia.nocookie.net/pokemon/images/d/d0/Hivebadge.png/revision/latest?cb=20081229171030"height="20" width="20" title="Hive Badge 2G">';
        var Plainbadge = '<img src="http://vignette4.wikia.nocookie.net/pokemon/images/4/42/Plainbadge.png/revision/latest?cb=20081229171221"height="20" width="20" title="Plain Badge 2G">';
        var fogbadge = '<img src="http://vignette3.wikia.nocookie.net/pokemon/images/4/4f/Fogbadge.png/revision/latest?cb=20081229170948"height="20" width="20" title="Fog Badge 2G">';
                var stormbadge = '<img src="http://vignette4.wikia.nocookie.net/pokemon/images/c/ca/Stormbadge.png/revision/latest?cb=20081229171417"height="20" width="20" title="Storm Badge 2G">';
        var self = this;
        fs.readFile('leaguebadges.txt', 'utf8', function(err, data) {
            if (err) console.log(err);
            var row = ('' + data).split('\n');
            var match = false;
            var badges;
            for (var i = row.length; i > -1; i--) {
                if (!row[i]) continue;
                var split = row[i].split(':');
                if (split[0] == targetUser.userid) {
                    match = true;
                    currentbadges = split[1];
                }
            }
            if (match == true) {
                var leaguebadgelist = '';
                if (currentbadges.indexOf('boulderbadge') > -1) leaguebadgelist += ' ' + boulderbadge;
                if (currentbadges.indexOf('cascadebadge') > -1) leaguebadgelist += ' ' + cascadebadge;
                if (currentbadges.indexOf('thunderbadge') > -1) leaguebadgelist += ' ' + thunderbadge;
                if (currentbadges.indexOf('rainbowbadge') > -1) leaguebadgelist += ' ' + rainbowbadge;
                if (currentbadges.indexOf('soulbadge') > -1) leaguebadgelist += ' ' + soulbadge;
                if (currentbadges.indexOf('marshbadge') > -1) leaguebadgelist += ' ' + marshbadge;
                if (currentbadges.indexOf('volcanobadge') > -1) leaguebadgelist += ' ' + volcanobadge;
                if (currentbadges.indexOf('earthbadge') > -1) leaguebadgelist += ' ' + earthbadge;
                if (currentbadges.indexOf('zephyrbadge') > -1) leaguebadgelist += ' ' + zephyrbadge;
                if (currentbadges.indexOf('hivebadge') > -1) leaguebadgelist += ' ' + hivebadge;
                if (currentbadges.indexOf('plainbadge ') > -1) leaguebadgelist += ' ' + plainbadge ;
                if (currentbadges.indexOf('fogbadge') > -1) leaguebadgelist += ' ' + fogbadge;
                if (currentbadges.indexOf('stormbadge') > -1) leaguebadgelist += ' ' + stormbadge;
                self.sendReplyBox(targetUser.userid + "'s badges: " + leaguebadgelist);
                room.update();
            } else {
                self.sendReplyBox('User ' + targetUser.userid + ' has no League badges.');
                room.update();
            }
        });
    },













      
	
			



    helixfossil: 'm8b',
    helix: 'm8b',
    magic8ball: 'm8b',
    m8b: function(target, room, user) {
        if (!this.canBroadcast()) return;
        var random = Math.floor(20 * Math.random()) + 1;
        var results = '';
        if (random == 1) {
            results = 'Signs point to yes.';
        }
        if (random == 2) {
            results = 'Yes.';
        }
        if (random == 3) {
            results = 'Reply hazy, try again.';
        }
        if (random == 4) {
            results = 'Without a doubt.';
        }
        if (random == 5) {
            results = 'My sources say no.';
        }
        if (random == 6) {
            results = 'As I see it, yes.';
        }
        if (random == 7) {
            results = 'You may rely on it.';
        }
        if (random == 8) {
            results = 'Concentrate and ask again.';
        }
        if (random == 9) {
            results = 'Outlook not so good.';
        }
        if (random == 10) {
            results = 'It is decidedly so.';
        }
        if (random == 11) {
            results = 'Better not tell you now.';
        }
        if (random == 12) {
            results = 'Very doubtful.';
        }
        if (random == 13) {
            results = 'Yes - definitely.';
        }
        if (random == 14) {
            results = 'It is certain.';
        }
        if (random == 15) {
            results = 'Cannot predict now.';
        }
        if (random == 16) {
            results = 'Most likely.';
        }
        if (random == 17) {
            results = 'Ask again later.';
        }
        if (random == 18) {
            results = 'My reply is no.';
        }
        if (random == 19) {
            results = 'Outlook good.';
        }
        if (random == 20) {
            results = 'Don\'t count on it.';
        }
        return this.sendReplyBox('' + results + '');
    },
    hue: function(target, room, user) {
        if (!this.canBroadcast()) return;
        this.sendReplyBox('<center><img src="http://reactiongifs.me/wp-content/uploads/2013/08/ducks-laughing.gif">');
    },
    coins: 'coingame',
    coin: 'coingame',
    coingame: function(target, room, user) {
        if (!this.canBroadcast()) return;
        var random = Math.floor(2 * Math.random()) + 1;
        var results = '';
        if (random == 1) {
            results = '<img src="http://surviveourcollapse.com/wp-content/uploads/2013/01/zinc.png" width="15%" title="Heads!"><br>It\'s heads!';
        }
        if (random == 2) {
            results = '<img src="http://upload.wikimedia.org/wikipedia/commons/e/e5/2005_Penny_Rev_Unc_D.png" width="15%" title="Tails!"><br>It\'s tails!';
        }
        return this.sendReplyBox('<center><font size="3"><b>Coin Game!</b></font><br>' + results + '');
    },
    

color: function(target, room, user) {
        if (!this.canBroadcast()) return;
        if (target === 'list' || target === 'help' || target === 'options') {
            return this.sendReplyBox('The random colors are: <b><font color="red">Red</font>, <font color="blue">Blue</font>, <font color="orange">Orange</font>, <font color="green">Green</font>, <font color="teal">Teal</font>, <font color="brown">Brown</font>, <font color="black">Black</font>, <font color="purple">Purple</font>, <font color="pink">Pink</font>, <font color="gray">Gray</font>, <font color="tan">Tan</font>, <font color="gold">Gold</font>, <font color=#CC0000>R</font><font color=#AE1D00>a</font><font color=#913A00>i</font><font color=#745700>n</font><font color=#577400>b</font><font color=#3A9100>o</font><font color=#1DAE00>w</font>.');
        }
        var colors = ['Red', 'Blue', 'Orange', 'Green', 'Teal', 'Brown', 'Black', 'Purple', 'Pink', 'Grey', 'Tan', 'Gold'];
        var results = colors[Math.floor(Math.random() * colors.length)];
        if (results == 'Rainbow') {
            return this.sendReply('The random color is :<b><font color=#CC0000>R</font><font color=#AE1D00>a</font><font color=#913A00>i</font><font color=#745700>n</font><font color=#577400>b</font><font color=#3A9100>o</font><font color=#1DAE00>w</font></b>');
        } else {
            return this.sendReplyBox('The random color is:<b><font color=' + results + '>' + results + '</font></b>');
        }
    },
lockshop: 'closeshop',
    closeshop: function(target, room, user) {
        if (!user.can('hotpatch')) return this.sendReply('You do not have enough authority to do this.');
        if (closeShop && closedShop === 1) closedShop--;
        if (closeShop) {
            return this.sendReply('The shop is already closed. Use /openshop to open the shop to buyers.');
        } else if (!closeShop) {
            if (closedShop === 0) {
                this.sendReply('Are you sure you want to close the shop? People will not be able to buy anything. If you do, use the command again.');
                closedShop++;
            } else if (closedShop === 1) {
                closeShop = true;
                closedShop--;
                this.add('|raw|<center><h4><b>The shop has been temporarily closed, during this time you cannot buy items.</b></h4></center>');
            }
        }
    },
    openshop: function(target, room, user) {
        if (!user.can('hotpatch')) return this.sendReply('You do not have enough authority to do this.');
        if (!closeShop && closedShop === 1) closedShop--;
        if (!closeShop) {
            return this.sendRepy('The shop is already closed. Use /closeshop to close the shop to buyers.');
        } else if (closeShop) {
            if (closedShop === 0) {
                this.sendReply('Are you sure you want to open the shop? People will be able to buy again. If you do, use the command again.');
                closedShop++;
            } else if (closedShop === 1) {
                closeShop = false;
                closedShop--;
                this.add('|raw|<center><h4><b>The shop has been opened, you can now buy from the shop.</b></h4></center>');
            }
        }
    },
    /*shoplift: 'awarditem',
    giveitem: 'awarditem',
    awarditem: function(target, room, user) {
        if (!target) return this.parse('/help awarditem');
        if (!user.can('pban')) return this.sendReply('You do not have enough authority to do this.');
        target = this.splitTarget(target);
        var targetUser = this.targetUser;
        if (!target) return this.parse('/help awarditem');
        if (!targetUser) {
            return this.sendReply('User ' + this.targetUsername + ' not found.');
        }
        var matched = false;
        var isItem = false;
        var theItem = '';
        for (var i = 0; i < inShop.length; i++) {
            if (target.toLowerCase() === inShop[i]) {
                isItem = true;
                theItem = inShop[i];
            }
        }
        if (isItem) {
            switch (theItem) {
                case 'symbol':
                    if (targetUser.canCustomSymbol === true) {
                        return this.sendReply('This user has already bought that item from the shop... no need for another.');
                    }
                    if (targetUser.canCustomSymbol === false) {
                        matched = true;
                        this.sendReply(targetUser.name + ' can now use /customsymbol to get a custom symbol.');
                        targetUser.canCustomSymbol = true;
                        Rooms.rooms.lobby.add(user.name + ' has stolen custom symbol from the shop!');
                        targetUser.send(user.name + ' has given you ' + theItem + '! Use /customsymbol [symbol] to add the symbol!');
                    }
                    break;
                case 'custom':
                    if (targetUser.canCustomAvatar === true) {
                        return this.sendReply('This user has already bought that item from the shop... no need for another.');
                    }
                    if (targetUser.canCustomAvatar === false) {
                        matched = true;
                        targetUser.canCustomAvatar = true;
                        Rooms.rooms.lobby.add(user.name + ' has stolen a custom avatar from the shop!');
                        targetUser.send(user.name + ' has given you ' + theItem + '!');
                    }
                    break;
                case 'emote':
                    if (targetUser.canCustomEmote === true) {
                        return this.sendReply('This user has already bought that item from the shop... no need for another.');
                    }
                    if (targetUser.canCustomEmote === false) {
                        matched = true;
                        targetUser.canCustomEmote = true;
                        Rooms.rooms.lobby.add(user.name + ' has stolen a custom emote from the shop!');
                        targetUser.send(user.name + ' has given you ' + theItem + '!');
                    }
                    break;
                case 'animated':
                    if (targetUser.canAnimated === true) {
                        return this.sendReply('This user has already bought that item from the shop... no need for another.');
                    }
                    if (targetUser.canCustomAvatar === false) {
                        matched = true;
                        targetUser.canCustomAvatar = true;
                        Rooms.rooms.lobby.add(user.name + ' has stolen a custom avatar from the shop!');
                        targetUser.send(user.name + ' has given you ' + theItem + '!');
                    }
                    break;
                case 'room':
                    if (targetUser.canChatRoom === true) {
                        return this.sendReply('This user has already bought that item from the shop... no need for another.');
                    }
                    if (targetUser.canChatRoom === false) {
                        matched = true;
                        targetUser.canChatRoom = true;
                        Rooms.rooms.lobby.add(user.name + ' has stolen a chat room from the shop!');
                        targetUser.send(user.name + ' has given you ' + theItem + '!');
                    }
                    break;
                case 'trainer':
                    if (targetUser.canTrainerCard === true) {
                        return this.sendReply('This user has already bought that item from the shop... no need for another.');
                    }
                    if (targetUser.canTrainerCard === false) {
                        matched = true;
                        targetUser.canTrainerCard = true;
                        Rooms.rooms.lobby.add(user.name + ' has stolen a trainer card from the shop!');
                        targetUser.send(user.name + ' has given you ' + theItem + '!');
                    }
                    break;
                case 'musicbox':
                    if (targetUser.canMusicBox === true) {
                        return this.sendReply('This user has already bought that item from the shop... no need for another.');
                    }
                    if (targetUser.canMusicBox === false) {
                        matched = true;
                        targetUser.canMusicBox = true;
                        Rooms.rooms.lobby.add(user.name + ' has stolen a music box from the shop!');
                        targetUser.send(user.name + ' has given you ' + theItem + '!');
                    }
                    break;
                case 'fix':
                    if (targetUser.canFixItem === true) {
                        return this.sendReply('This user has already bought that item from the shop... no need for another.');
                    }
                    if (targetUser.canFixItem === false) {
                        matched = true;
                        targetUser.canFixItem = true;
                        Rooms.rooms.lobby.add(user.name + ' has stolen the ability to alter a current trainer card or avatar from the shop!');
                        targetUser.send(user.name + ' has given you the ability to set ' + theItem + '!');
                    }
                    break;
                case 'declare':
                    if (targetUser.canDecAdvertise === true) {
                        return this.sendReply('This user has already bought that item from the shop... no need for another.');
                    }
                    if (targetUser.canDecAdvertise === false) {
                        matched = true;
                        targetUser.canDecAdvertise = true;
                        Rooms.rooms.lobby.add(user.name + ' has stolen the ability to get a declare from the shop!');
                        targetUser.send(user.name + ' has given you the ability to set ' + theItem + '!');
                    }
                    break;
                default:
                    return this.sendReply('Maybe that item isn\'t in the shop yet.');
            }
        } else {
            return this.sendReply('Shop item could not be found, please check /shop for all items - ' + theItem);
        }
    },*/
    /*removeitem: function(target, room, user) {
        if (!target) return this.parse('/help removeitem');
        if (!user.can('hotpatch')) return this.sendReply('You do not have enough authority to do this.');
        target = this.splitTarget(target);
        var targetUser = this.targetUser;
        if (!target) return this.parse('/help removeitem');
        if (!targetUser) {
            return this.sendReply('User ' + this.targetUsername + ' not found.');
        }
        switch (target) {
            case 'symbol':
                if (targetUser.canCustomSymbol) {
                    targetUser.canCustomSymbol = false;
                    this.sendReply(targetUser.name + ' no longer has a custom symbol ready to use.');
                    targetUser.send(user.name + ' has removed the custom symbol from you.');
                } else {
                    return this.sendReply('They do not have a custom symbol for you to remove.');
                }
                break;
            case 'custombattlesong':
            case 'battlesong':
            case 'cbs':
                if (targetUser.canCustomBattleSong) {
                    targetUser.canCustomBattleSong = false;
                    this.sendReply(targetUser.name + 'no longer has a custom battle song ready to use.');
                    targetUser.send(user.name + ' has removed the custom battle song from you.');
                } else {
                    return this.sendReply("They do not have a custom battle song for you to remove.");
                }
                break;
            case 'custom':
                if (targetUser.canCustomAvatar) {
                    targetUser.canCustomAvatar = false;
                    this.sendReply(targetUser.name + ' no longer has a custom avatar ready to use.');
                    targetUser.send(user.name + ' has removed the custom avatar from you.');
                } else {
                    return this.sendReply('They do not have a custom avatar for you to remove.');
                }
                break;
            case 'emote':
                if (targetUser.canCustomEmote) {
                    targetUser.canCustomEmote = false;
                    this.sendReply(targetUser.name + ' no longer has a custom emote ready to use.');
                    targetUser.send(user.name + ' has removed the custom emote from you.');
                } else {
                    return this.sendReply('They do not have a custom emote for you to remove.');
                }
                break;
            case 'animated':
                if (targetUser.canAnimatedAvatar) {
                    targetUser.canAnimatedAvatar = false;
                    this.sendReply(targetUser.name + ' no longer has a animated avatar ready to use.');
                    targetUser.send(user.name + ' has removed the animated avatar from you.');
                } else {
                    return this.sendReply('They do not have an animated avatar for you to remove.');
                }
                break;
            case 'room':
                if (targetUser.canChatRoom) {
                    targetUser.canChatRoom = false;
                    this.sendReply(targetUser.name + ' no longer has a chat room ready to use.');
                    targetUser.send(user.name + ' has removed the chat room from you.');
                } else {
                    return this.sendReply('They do not have a chat room for you to remove.');
                }
                break;
            case 'trainer':
                if (targetUser.canTrainerCard) {
                    targetUser.canTrainerCard = false;
                    this.sendReply(targetUser.name + ' no longer has a trainer card ready to use.');
                    targetUser.send(user.name + ' has removed the trainer card from you.');
                } else {
                    return this.sendReply('They do not have a trainer card for you to remove.');
                }
                break;
            case 'musicbox':
                if (targetUser.canMusicBox) {
                    targetUser.canMusicBox = false;
                    this.sendReply(targetUser.name + ' no longer has a music box ready to use.');
                    targetUser.send(user.name + ' has removed the music box from you.');
                } else {
                    return this.sendReply('They do not have a music box for you to remove.');
                }
                break;
            case 'fix':
                if (targetUser.canFixItem) {
                    targetUser.canFixItem = false;
                    this.sendReply(targetUser.name + ' no longer has the fix to use.');
                    targetUser.send(user.name + ' has removed the fix from you.');
                } else {
                    return this.sendReply('They do not have a trainer card for you to remove.');
                }
                break;
            case 'forcerename':
            case 'fr':
                if (targetUser.canForcerename) {
                    targetUser.canForcerename = false;
                    this.sendReply(targetUser.name + ' no longer has the forcerename to use.');
                    targetUser.send(user.name + ' has removed forcerename from you.');
                } else {
                    return this.sendReply('They do not have a forcerename for you to remove.');
                }
                break;
            case 'declare':
                if (targetUser.canDecAdvertise) {
                    targetUser.canDecAdvertise = false;
                    this.sendReply(targetUser.name + ' no longer has a declare ready to use.');
                    targetUser.send(user.name + ' has removed the declare from you.');
                } else {
                    return this.sendReply('They do not have a trainer card for you to remove.');
                }
                break;
            default:
                return this.sendReply('That isn\'t a real item you fool!');
        }
    },*/
    friendcodehelp: function(target, room, user) {
        if (!this.canBroadcast()) return;
        this.sendReplyBox('<b>Friend Code Help:</b> <br><br />' +
            '/friendcode (/fc) [friendcode] - Sets your Friend Code.<br />' +
            '/getcode (gc) - Sends you a popup of all of the registered user\'s Friend Codes.<br />' +
            '/deletecode [user] - Deletes this user\'s friend code from the server (Requires %, @, &, ~)<br>' +
            '<i>--Any questions, PM papew!</i>');
    },
    friendcode: 'fc',
    fc: function(target, room, user, connection) {
        if (!target) {
            return this.sendReply("Enter in your friend code. Make sure it's in the format: xxxx-xxxx-xxxx or xxxx xxxx xxxx or xxxxxxxxxxxx.");
        }
        var fc = target;
        fc = fc.replace(/-/g, '');
        fc = fc.replace(/ /g, '');
        if (isNaN(fc)) return this.sendReply("The friend code you submitted contains non-numerical characters. Make sure it's in the format: xxxx-xxxx-xxxx or xxxx xxxx xxxx or xxxxxxxxxxxx.");
        if (fc.length < 12) return this.sendReply("The friend code you have entered is not long enough! Make sure it's in the format: xxxx-xxxx-xxxx or xxxx xxxx xxxx or xxxxxxxxxxxx.");
        fc = fc.slice(0, 4) + '-' + fc.slice(4, 8) + '-' + fc.slice(8, 12);
        var codes = fs.readFileSync('config/friendcodes.txt', 'utf8');
        if (codes.toLowerCase().indexOf(user.name) > -1) {
            return this.sendReply("Your friend code is already here.");
        }
        code.write('\n' + user.name + ': ' + fc);
        return this.sendReply("Your Friend Code: " + fc + " has been set.");
    },
    viewcode: 'gc',
    getcodes: 'gc',
    viewcodes: 'gc',
    vc: 'gc',
    getcode: 'gc',
    gc: function(target, room, user, connection) {
        var codes = fs.readFileSync('config/friendcodes.txt', 'utf8');
        return user.send('|popup|' + codes);
    },
    userauth: function(target, room, user, connection) {
        var targetId = toId(target) || user.userid;
        var targetUser = Users.getExact(targetId);
        var targetUsername = (targetUser ? targetUser.name : target);
        var buffer = [];
        var innerBuffer = [];
        var group = Users.usergroups[targetId];
        if (group) {
            buffer.push('Global auth: ' + group.charAt(0));
        }
        for (var i = 0; i < Rooms.global.chatRooms.length; i++) {
            var curRoom = Rooms.global.chatRooms[i];
            if (!curRoom.auth || curRoom.isPrivate) continue;
            group = curRoom.auth[targetId];
            if (!group) continue;
            innerBuffer.push(group + curRoom.id);
        }
        if (innerBuffer.length) {
            buffer.push('Room auth: ' + innerBuffer.join(', '));
        }
        if (targetId === user.userid || user.can('makeroom')) {
            innerBuffer = [];
            for (var i = 0; i < Rooms.global.chatRooms.length; i++) {
                var curRoom = Rooms.global.chatRooms[i];
                if (!curRoom.auth || !curRoom.isPrivate) continue;
                var auth = curRoom.auth[targetId];
                if (!auth) continue;
                innerBuffer.push(auth + curRoom.id);
            }
            if (innerBuffer.length) {
                buffer.push('Private room auth: ' + innerBuffer.join(', '));
            }
        }
        if (!buffer.length) {
            buffer.push("No global or room auth.");
        }
        buffer.unshift("" + targetUsername + " user auth:");
        connection.popup(buffer.join("\n\n"));
    },
    showpic: function(target, room, user) {
        if (!target) return this.sendReply('/showpic [url], [size] - Adds a picture to the room. Size of 100 is the width of the room (100%).');
        if (!room.isPrivate || !room.auth) return this.sendReply('You can only do this in unofficial private rooms.');
        target = tour.splint(target);
        var picSize = '';
        if (target[1]) {
            if (target[1] < 1 || target[1] > 100) return this.sendReply('Size must be between 1 and 100.');
            picSize = ' height=' + target[1] + '% width=' + target[1] + '%';
        }
        this.add('|raw|<div class="broadcast-blue"><img src=' + target[0] + picSize + '></div>');
        this.logModCommand(user.name + ' added the image ' + target[0]);
    },
    deletecode: function(target, room, user) {
        if (!target) {
            return this.sendReply('/deletecode [user] - Deletes the Friend Code of the User.');
        }
        t = this;
        if (!this.can('lock')) return false;
        fs.readFile('config/friendcodes.txt', 'utf8', function(err, data) {
            if (err) console.log(err);
            hi = this;
            var row = ('' + data).split('\n');
            match = false;
            line = '';
            for (var i = row.length; i > -1; i--) {
                if (!row[i]) continue;
                var line = row[i].split(':');
                if (target === line[0]) {
                    match = true;
                    line = row[i];
                }
                break;
            }
            if (match === true) {
                var re = new RegExp(line, 'g');
                var result = data.replace(re, '');
                fs.writeFile('config/friendcodes.txt', result, 'utf8', function(err) {
                    if (err) t.sendReply(err);
                    t.sendReply('The Friendcode ' + line + ' has been deleted.');
                });
            } else {
                t.sendReply('There is no match.');
            }
        });
    },


	
	host: function (target, room, user, connection, cmd) {
		if (!target) return this.parse('/help host');
		if (!this.can('rangeban')) return;
		if (!/[0-9.]+/.test(target)) return this.sendReply('You must pass a valid IPv4 IP to /host.');
		var self = this;
		Dnsbl.reverse(target, function (err, hosts) {
			self.sendReply('IP ' + target + ': ' + (hosts ? hosts[0] : 'NULL'));
		});
	},
	hosthelp: ["/host [ip] - Gets the host for a given IP. Requires: & ~"],

	ipsearchall: 'ipsearch',
	hostsearch: 'ipsearch',
	ipsearch: function (target, room, user, connection, cmd) {
		if (!target.trim()) return this.parse('/help ipsearch');
		if (!this.can('rangeban')) return;
		var results = [];

		var isAll = (cmd === 'ipsearchall');

		if (/[a-z]/.test(target)) {
			// host
			this.sendReply("Users with host " + target + ":");
			for (var userid in Users.users) {
				var curUser = Users.users[userid];
				if (!curUser.latestHost || !curUser.latestHost.endsWith(target)) continue;
				if (results.push((curUser.connected ? " \u25C9 " : " \u25CC ") + " " + curUser.name) > 100 && !isAll) {
					return this.sendReply("More than 100 users match the specified IP range. Use /ipsearchall to retrieve the full list.");
				}
			}
		} else if (target.slice(-1) === '*') {
			// IP range
			this.sendReply("Users in IP range " + target + ":");
			target = target.slice(0, -1);
			for (var userid in Users.users) {
				var curUser = Users.users[userid];
				if (!curUser.latestIp.startsWith(target)) continue;
				if (results.push((curUser.connected ? " \u25C9 " : " \u25CC ") + " " + curUser.name) > 100 && !isAll) {
					return this.sendReply("More than 100 users match the specified IP range. Use /ipsearchall to retrieve the full list.");
				}
			}
		} else {
			this.sendReply("Users with IP " + target + ":");
			for (var userid in Users.users) {
				var curUser = Users.users[userid];
				if (curUser.latestIp === target) {
					results.push((curUser.connected ? " \u25C9 " : " \u25CC ") + " " + curUser.name);
				}
			}
		}
		if (!results.length) return this.sendReply("No results found.");
		return this.sendReply(results.join('; '));
	},
	ipsearchhelp: ["/ipsearch [ip|range|host] - Find all users with specified IP, IP range, or host. Requires: & ~"],

	/*********************************************************
	 * Shortcuts
	 *********************************************************/

	inv: 'invite',
	invite: function (target, room, user) {
		if (!target) return this.parse('/help invite');
		target = this.splitTarget(target);
		if (!this.targetUser) {
			return this.sendReply("User " + this.targetUsername + " not found.");
		}
		var targetRoom = (target ? Rooms.search(target) : room);
		if (!targetRoom) {
			return this.sendReply("Room " + target + " not found.");
		}
		return this.parse('/msg ' + this.targetUsername + ', /invite ' + targetRoom.id);
	},
	invitehelp: ["/invite [username], [roomname] - Invites the player [username] to join the room [roomname]."],

	/*********************************************************
	 * Data Search Tools
	 *********************************************************/

	pstats: 'data',
	stats: 'data',
	dex: 'data',
	pokedex: 'data',
	data: function (target, room, user, connection, cmd) {
		if (!this.canBroadcast()) return;

		var buffer = '';
		var targetId = toId(target);
		if (!targetId) return this.parse('/help data');
		if (targetId === '' + parseInt(targetId)) {
			for (var p in Tools.data.Pokedex) {
				var pokemon = Tools.getTemplate(p);
				if (pokemon.num === parseInt(target)) {
					target = pokemon.species;
					targetId = pokemon.id;
					break;
				}
			}
		}
		var newTargets = Tools.dataSearch(target);
		var showDetails = (cmd === 'dt' || cmd === 'details');
		if (newTargets && newTargets.length) {
			for (var i = 0; i < newTargets.length; ++i) {
				if (newTargets[i].id !== targetId && !Tools.data.Aliases[targetId] && !i) {
					buffer = "No Pok\u00e9mon, item, move, ability or nature named '" + target + "' was found. Showing the data of '" + newTargets[0].name + "' instead.\n";
				}
				if (newTargets[i].searchType === 'nature') {
					buffer += "" + newTargets[i].name + " nature: ";
					if (newTargets[i].plus) {
						var statNames = {'atk': "Attack", 'def': "Defense", 'spa': "Special Attack", 'spd': "Special Defense", 'spe': "Speed"};
						buffer += "+10% " + statNames[newTargets[i].plus] + ", -10% " + statNames[newTargets[i].minus] + ".";
					} else {
						buffer += "No effect.";
					}
					return this.sendReply(buffer);
				} else {
					buffer += '|c|~|/data-' + newTargets[i].searchType + ' ' + newTargets[i].name + '\n';
				}
			}
		} else {
			return this.sendReply("No Pok\u00e9mon, item, move, ability or nature named '" + target + "' was found. (Check your spelling?)");
		}

		if (showDetails) {
			var details;
			var isSnatch = false;
			var isMirrorMove = false;
			if (newTargets[0].searchType === 'pokemon') {
				var pokemon = Tools.getTemplate(newTargets[0].name);
				var weighthit = 20;
				if (pokemon.weightkg >= 200) {
					weighthit = 120;
				} else if (pokemon.weightkg >= 100) {
					weighthit = 100;
				} else if (pokemon.weightkg >= 50) {
					weighthit = 80;
				} else if (pokemon.weightkg >= 25) {
					weighthit = 60;
				} else if (pokemon.weightkg >= 10) {
					weighthit = 40;
				}
				details = {
					"Dex#": pokemon.num,
					"Gen": pokemon.gen,
					"Height": pokemon.heightm + " m",
					"Weight": pokemon.weightkg + " kg <em>(" + weighthit + " BP)</em>",
					"Dex Colour": pokemon.color,
					"Egg Group(s)": pokemon.eggGroups.join(", ")
				};
				if (!pokemon.evos.length) {
					details["<font color=#585858>Does Not Evolve</font>"] = "";
				} else {
					details["Evolution"] = pokemon.evos.map(function (evo) {
						evo = Tools.getTemplate(evo);
						return evo.name + " (" + evo.evoLevel + ")";
					}).join(", ");
				}
			} else if (newTargets[0].searchType === 'move') {
				var move = Tools.getMove(newTargets[0].name);
				details = {
					"Priority": move.priority,
					"Gen": move.gen
				};

				if (move.secondary || move.secondaries) details["<font color=black>&#10003; Secondary effect</font>"] = "";
				if (move.flags['contact']) details["<font color=black>&#10003; Contact</font>"] = "";
				if (move.flags['sound']) details["<font color=black>&#10003; Sound</font>"] = "";
				if (move.flags['bullet']) details["<font color=black>&#10003; Bullet</font>"] = "";
				if (move.flags['pulse']) details["<font color=black>&#10003; Pulse</font>"] = "";
				if (!move.flags['protect'] && !/(ally|self)/i.test(move.target)) details["<font color=black>&#10003; Bypasses Protect</font>"] = "";
				if (move.flags['authentic']) details["<font color=black>&#10003; Bypasses Substitutes</font>"] = "";
				if (move.flags['defrost']) details["<font color=black>&#10003; Thaws user</font>"] = "";
				if (move.flags['bite']) details["<font color=black>&#10003; Bite</font>"] = "";
				if (move.flags['punch']) details["<font color=black>&#10003; Punch</font>"] = "";
				if (move.flags['powder']) details["<font color=black>&#10003; Powder</font>"] = "";
				if (move.flags['reflectable']) details["<font color=black>&#10003; Bounceable</font>"] = "";
				if (move.flags['gravity']) details["<font color=black>&#10007; Suppressed by Gravity</font>"] = "";

				if (move.id === 'snatch') isSnatch = true;
				if (move.id === 'mirrormove') isMirrorMove = true;

				details["Target"] = {
					'normal': "One Adjacent Pok\u00e9mon",
					'self': "User",
					'adjacentAlly': "One Ally",
					'adjacentAllyOrSelf': "User or Ally",
					'adjacentFoe': "One Adjacent Opposing Pok\u00e9mon",
					'allAdjacentFoes': "All Adjacent Opponents",
					'foeSide': "Opposing Side",
					'allySide': "User's Side",
					'allyTeam': "User's Side",
					'allAdjacent': "All Adjacent Pok\u00e9mon",
					'any': "Any Pok\u00e9mon",
					'all': "All Pok\u00e9mon"
				}[move.target] || "Unknown";
			} else if (newTargets[0].searchType === 'item') {
				var item = Tools.getItem(newTargets[0].name);
				details = {
					"Gen": item.gen
				};

				if (item.fling) {
					details["Fling Base Power"] = item.fling.basePower;
					if (item.fling.status) details["Fling Effect"] = item.fling.status;
					if (item.fling.volatileStatus) details["Fling Effect"] = item.fling.volatileStatus;
					if (item.isBerry) details["Fling Effect"] = "Activates the Berry's effect on the target.";
					if (item.id === 'whiteherb') details["Fling Effect"] = "Restores the target's negative stat stages to 0.";
					if (item.id === 'mentalherb') details["Fling Effect"] = "Removes the effects of Attract, Disable, Encore, Heal Block, Taunt, and Torment from the target.";
				} else {
					details["Fling"] = "This item cannot be used with Fling.";
				}
				if (item.naturalGift) {
					details["Natural Gift Type"] = item.naturalGift.type;
					details["Natural Gift Base Power"] = item.naturalGift.basePower;
				}
			} else {
				details = {};
			}

			buffer += '|raw|<font size="1">' + Object.keys(details).map(function (detail) {
				return '<font color=#585858>' + detail + (details[detail] !== '' ? ':</font> ' + details[detail] : '</font>');
			}).join("&nbsp;|&ThickSpace;") + '</font>';

			if (isSnatch) buffer += '&nbsp;|&ThickSpace;<a href="https://pokemonshowdown.com/dex/moves/snatch"><font size="1">Snatchable Moves</font></a>';
			if (isMirrorMove) buffer += '&nbsp;|&ThickSpace;<a href="https://pokemonshowdown.com/dex/moves/mirrormove"><font size="1">Mirrorable Moves</font></a>';
		}
		this.sendReply(buffer);
	},
	datahelp: ["/data [pokemon/item/move/ability] - Get details on this pokemon/item/move/ability/nature.",
		"!data [pokemon/item/move/ability] - Show everyone these details. Requires: + % @ # & ~"],

	dt: 'details',
	details: function (target) {
		if (!target) return this.parse('/help details');
		this.run('data');
	},
	detailshelp: ["/details [pokemon] - Get additional details on this pokemon/item/move/ability/nature.",
		"!details [pokemon] - Show everyone these details. Requires: + % @ # & ~"],

	ds: 'dexsearch',
	dsearch: 'dexsearch',
	dexsearch: function (target, room, user, connection, cmd, message) {
		if (!this.canBroadcast()) return;

		if (!target) return this.parse('/help dexsearch');
		var targets = target.split(',');
		var searches = {};
		var allTiers = {'uber':1, 'ou':1, 'bl':1, 'uu':1, 'bl2':1, 'ru':1, 'bl3':1, 'nu':1, 'bl4':1, 'pu':1, 'nfe':1, 'lc uber':1, 'lc':1, 'cap':1};
		var allColours = {'green':1, 'red':1, 'blue':1, 'white':1, 'brown':1, 'yellow':1, 'purple':1, 'pink':1, 'gray':1, 'black':1};
		var allStats = {'hp':1, 'atk':1, 'def':1, 'spa':1, 'spd':1, 'spe':1, 'bst':1};
		var showAll = false;
		var megaSearch = null;
		var randomOutput = 0;
		var categories = ['gen', 'tier', 'color', 'types', 'ability', 'stats', 'compileLearnsets', 'moves', 'recovery', 'priority'];

		for (var i = 0; i < targets.length; i++) {
			var isNotSearch = false;
			target = targets[i].trim().toLowerCase();
			if (target.charAt(0) === '!') {
				isNotSearch = true;
				target = target.substr(1);
			}

			var targetAbility = Tools.getAbility(targets[i]);
			if (targetAbility.exists) {
				if (!searches['ability']) searches['ability'] = {};
				if (Object.count(searches['ability'], true) === 1 && !isNotSearch) return this.sendReplyBox("Specify only one ability.");
				if ((searches['ability'][targetAbility.name] && isNotSearch) || (searches['ability'][targetAbility.name] === false && !isNotSearch)) return this.sendReplyBox("A search cannot both exclude and include an ability.");
				searches['ability'][targetAbility.name] = !isNotSearch;
				continue;
			}

			if (target in allTiers) {
				if (!searches['tier']) searches['tier'] = {};
				if ((searches['tier'][target] && isNotSearch) || (searches['tier'][target] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include a tier.');
				searches['tier'][target] = !isNotSearch;
				continue;
			}

			if (target in allColours) {
				if (!searches['color']) searches['color'] = {};
				if ((searches['color'][target] && isNotSearch) || (searches['color'][target] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include a color.');
				searches['color'][target] = !isNotSearch;
				continue;
			}

			if (target.substr(0, 3) === 'gen' && Number.isInteger(parseFloat(target.substr(3)))) target = target.substr(3).trim();
			var targetInt = parseInt(target);
			if (0 < targetInt && targetInt < 7) {
				if (!searches['gen']) searches['gen'] = {};
				if ((searches['gen'][target] && isNotSearch) || (searches['gen'][target] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include a generation.');
				searches['gen'][target] = !isNotSearch;
				continue;
			}

			if (target === 'all') {
				if (this.broadcasting) return this.sendReplyBox("A search with the parameter 'all' cannot be broadcast.");
				showAll = true;
				continue;
			}

			if (target.substr(0, 6) === 'random' && cmd === 'randpoke') {
				randomOutput = parseInt(target.substr(6));
				continue;
			}

			if (target === 'megas' || target === 'mega') {
				if ((megaSearch && isNotSearch) || (megaSearch === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include Mega Evolutions.');
				megaSearch = !isNotSearch;
				continue;
			}

			if (target === 'recovery') {
				if ((searches['recovery'] && isNotSearch) || (searches['recovery'] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and recovery moves.');
				searches['recovery'] = !isNotSearch;
				continue;
			}

			if (target === 'priority') {
				if ((searches['priority'] && isNotSearch) || (searches['priority'] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and recovery moves.');
				searches['priority'] = !isNotSearch;
				continue;
			}

			var targetMove = Tools.getMove(target);
			if (targetMove.exists) {
				if (!searches['moves']) searches['moves'] = {};
				if (Object.count(searches['moves'], true) === 4 && !isNotSearch) return this.sendReplyBox("Specify a maximum of 4 moves.");
				if ((searches['moves'][targetMove.id] && isNotSearch) || (searches['moves'][targetMove.id] === false && !isNotSearch)) return this.sendReplyBox("A search cannot both exclude and include a move.");
				searches['moves'][targetMove.id] = !isNotSearch;
				continue;
			}

			var typeIndex = target.indexOf(' type');
			if (typeIndex >= 0) {
				target = target.charAt(0).toUpperCase() + target.substring(1, typeIndex);
				if (target in Tools.data.TypeChart) {
					if (!searches['types']) searches['types'] = {};
					if (Object.count(searches['types'], true) === 2 && !isNotSearch) return this.sendReplyBox("Specify a maximum of two types.");
					if ((searches['types'][target] && isNotSearch) || (searches['types'][target] === false && !isNotSearch)) return this.sendReplyBox("A search cannot both exclude and include a type.");
					searches['types'][target] = !isNotSearch;
					continue;
				}
			}

			var inequality = target.search(/>|<|=/);
			if (inequality >= 0) {
				if (isNotSearch) return this.sendReplyBox("You cannot use the negation symbol '!' in stat ranges.");
				if (target.charAt(inequality + 1) === '=') {
					inequality = target.substr(inequality, 2);
				} else {
					inequality = target.charAt(inequality);
				}
				var inequalityOffset = (inequality.charAt(1) === '=' ? 0 : -1);
				var targetParts = target.replace(/\s/g, '').split(inequality);
				var num, stat, direction;
				if (!isNaN(targetParts[0])) {
					// e.g. 100 < spe
					num = parseFloat(targetParts[0]);
					stat = targetParts[1];
					switch (inequality.charAt(0)) {
					case '>': direction = 'less'; num += inequalityOffset; break;
					case '<': direction = 'greater'; num -= inequalityOffset; break;
					case '=': direction = 'equal'; break;
					}
				} else if (!isNaN(targetParts[1])) {
					// e.g. spe > 100
					num = parseFloat(targetParts[1]);
					stat = targetParts[0];
					switch (inequality.charAt(0)) {
					case '<': direction = 'less'; num += inequalityOffset; break;
					case '>': direction = 'greater'; num -= inequalityOffset; break;
					case '=': direction = 'equal'; break;
					}
				} else {
					return this.sendReplyBox("No value given to compare with '" + Tools.escapeHTML(target) + "'.");
				}
				switch (toId(stat)) {
				case 'attack': stat = 'atk'; break;
				case 'defense': stat = 'def'; break;
				case 'specialattack': stat = 'spa'; break;
				case 'spatk': stat = 'spa'; break;
				case 'specialdefense': stat = 'spd'; break;
				case 'spdef': stat = 'spd'; break;
				case 'speed': stat = 'spe'; break;
				}
				if (!(stat in allStats)) return this.sendReplyBox("'" + Tools.escapeHTML(target) + "' did not contain a valid stat.");
				if (!searches['stats']) searches['stats'] = {};
				if (direction === 'equal') {
					if (searches['stats'][stat]) return this.sendReplyBox("Invalid stat range for " + stat + ".");
					searches['stats'][stat] = {};
					searches['stats'][stat]['less'] = num;
					searches['stats'][stat]['greater'] = num;
				} else {
					if (!searches['stats'][stat]) searches['stats'][stat] = {};
					if (searches['stats'][stat][direction]) return this.sendReplyBox("Invalid stat range for " + stat + ".");
					searches['stats'][stat][direction] = num;
				}
				continue;
			}
			return this.sendReplyBox("'" + Tools.escapeHTML(target) + "' could not be found in any of the search categories.");
		}

		if (showAll && Object.size(searches) === 0 && megaSearch === null) return this.sendReplyBox("No search parameters other than 'all' were found. Try '/help dexsearch' for more information on this command.");

		var dex = {};
		for (var pokemon in Tools.data.Pokedex) {
			var template = Tools.getTemplate(pokemon);
			var megaSearchResult = (megaSearch === null || (megaSearch === true && template.isMega) || (megaSearch === false && !template.isMega));
			if (template.tier !== 'Unreleased' && template.tier !== 'Illegal' && (template.tier !== 'CAP' || (searches['tier'] && searches['tier']['cap'])) && megaSearchResult) {
				dex[pokemon] = template;
			}
		}

		//Only construct full learnsets for Pokemon if learnsets are used in the search
		if (searches.moves || searches.recovery || searches.priority) searches['compileLearnsets'] = true;

		for (var cat = 0; cat < categories.length; cat++) {
			var search = categories[cat];
			if (!searches[search]) continue;
			switch (search) {
			case 'types':
				for (var mon in dex) {
					if (Object.count(searches[search], true) === 2) {
						if (!(searches[search][dex[mon].types[0]]) || !(searches[search][dex[mon].types[1]])) delete dex[mon];
					} else {
						if (searches[search][dex[mon].types[0]] === false || searches[search][dex[mon].types[1]] === false || (Object.count(searches[search], true) > 0 &&
							(!(searches[search][dex[mon].types[0]]) && !(searches[search][dex[mon].types[1]])))) delete dex[mon];
					}
				}
				break;

			case 'tier':
				for (var mon in dex) {
					if ('lc' in searches[search]) {
						// some LC legal Pokemon are stored in other tiers (Ferroseed/Murkrow etc)
						// this checks for LC legality using the going criteria, instead of dex[mon].tier
						var isLC = (dex[mon].evos && dex[mon].evos.length > 0) && !dex[mon].prevo && dex[mon].tier !== "LC Uber" && Tools.data.Formats['lc'].banlist.indexOf(dex[mon].species) < 0;
						if ((searches[search]['lc'] && !isLC) || (!searches[search]['lc'] && isLC)) {
							delete dex[mon];
							continue;
						}
					}
					if (searches[search][String(dex[mon][search]).toLowerCase()] === false ||
						Object.count(searches[search], true) > 0 && !searches[search][String(dex[mon][search]).toLowerCase()]) {
						delete dex[mon];
					}
				}
				break;

			case 'gen':
			case 'color':
				for (var mon in dex) {
					if (searches[search][String(dex[mon][search]).toLowerCase()] === false ||
						Object.count(searches[search], true) > 0 && !searches[search][String(dex[mon][search]).toLowerCase()]) {
						delete dex[mon];
					}
				}
				break;

			case 'ability':
				for (var mon in dex) {
					for (var ability in searches[search]) {
						var needsAbility = searches[search][ability];
						var hasAbility = Object.count(dex[mon].abilities, ability) > 0;
						if (hasAbility !== needsAbility) {
							delete dex[mon];
							break;
						}
					}
				}
				break;

			case 'compileLearnsets':
				for (var mon in dex) {
					var template = dex[mon];
					if (!template.learnset) template = Tools.getTemplate(template.baseSpecies);
					if (!template.learnset) continue;
					var fullLearnset = template.learnset;
					while (template.prevo) {
						template = Tools.getTemplate(template.prevo);
						for (var move in template.learnset) {
							if (!fullLearnset[move]) fullLearnset[move] = template.learnset[move];
						}
					}
					dex[mon].learnset = fullLearnset;
				}
				break;

			case 'moves':
				for (var mon in dex) {
					if (!dex[mon].learnset) continue;
					for (var move in searches[search]) {
						var canLearn = (dex[mon].learnset.sketch && ['chatter', 'struggle', 'magikarpsrevenge'].indexOf(move) < 0) || dex[mon].learnset[move];
						if ((!canLearn && searches[search][move]) || (searches[search][move] === false && canLearn)) {
							delete dex[mon];
							break;
						}
					}
				}
				break;

			case 'recovery':
				for (var mon in dex) {
					if (!dex[mon].learnset) continue;
					var recoveryMoves = ["recover", "roost", "moonlight", "morningsun", "synthesis", "milkdrink", "slackoff", "softboiled", "wish", "healorder"];
					var canLearn = false;
					for (var i = 0; i < recoveryMoves.length; i++) {
						canLearn = (dex[mon].learnset.sketch) || dex[mon].learnset[recoveryMoves[i]];
						if (canLearn) break;
					}
					if ((!canLearn && searches[search]) || (searches[search] === false && canLearn)) delete dex[mon];
				}
				break;

			case 'priority':
				var priorityMoves = [];
				for (var move in Tools.data.Movedex) {
					var moveData = Tools.getMove(move);
					if (moveData.category === "Status" || moveData.id === "bide") continue;
					if (moveData.priority > 0) priorityMoves.push(move);
				}
				for (var mon in dex) {
					if (!dex[mon].learnset) continue;
					var canLearn = false;
					for (var i = 0; i < priorityMoves.length; i++) {
						canLearn = (dex[mon].learnset.sketch) || dex[mon].learnset[priorityMoves[i]];
						if (canLearn) break;
					}
					if ((!canLearn && searches[search]) || (searches[search] === false && canLearn)) delete dex[mon];
				}
				break;

			case 'stats':
				for (var stat in searches[search]) {
					for (var mon in dex) {
						var monStat = 0;
						if (stat === 'bst') {
							for (var monStats in dex[mon].baseStats) {
								monStat += dex[mon].baseStats[monStats];
							}
						} else {
							monStat = dex[mon].baseStats[stat];
						}
						if (typeof searches[search][stat].less === 'number') {
							if (monStat > searches[search][stat].less) {
								delete dex[mon];
								continue;
							}
						}
						if (typeof searches[search][stat].greater === 'number') {
							if (monStat < searches[search][stat].greater) {
								delete dex[mon];
								continue;
							}
						}
					}
				}
				break;

			default:
				throw new Error("/dexsearch search category '" + search + "' was unrecognised.");
			}
		}

		var results = [];
		for (var mon in dex) {
			if (dex[mon].baseSpecies && results.indexOf(dex[mon].baseSpecies) >= 0) continue;
			results.push(dex[mon].species);
		}

		if (randomOutput && randomOutput < results.length) {
			results = results.randomize().slice(0, randomOutput);
		}

		var resultsStr = this.broadcasting ? "" : ("<font color=#999999>" + message + ":</font><br>");
		if (results.length > 1) {
			if (showAll || results.length <= RESULTS_MAX_LENGTH + 5) {
				results.sort();
				resultsStr += results.join(", ");
			} else {
				resultsStr += results.slice(0, RESULTS_MAX_LENGTH).join(", ") + ", and " + (results.length - RESULTS_MAX_LENGTH) + " more. <font color=#999999>Redo the search with 'all' as a search parameter to show all results.</font>";
			}
		} else if (results.length === 1) {
			return CommandParser.commands.data.call(this, results[0], room, user, connection, 'dt');
		} else {
			resultsStr += "No Pok&eacute;mon found.";
		}
		return this.sendReplyBox(resultsStr);
	},
	dexsearchhelp: ["/dexsearch [type], [move], [move], ... - Searches for Pok\u00e9mon that fulfill the selected criteria",
		"Search categories are: type, tier, color, moves, ability, gen, recovery, priority, stat.",
		"Valid colors are: green, red, blue, white, brown, yellow, purple, pink, gray and black.",
		"Valid tiers are: Uber/OU/BL/UU/BL2/RU/BL3/NU/PU/NFE/LC/CAP.",
		"Types must be followed by ' type', e.g., 'dragon type'.",
		"Inequality ranges use the characters '>' and '<' though they behave as '≥' and '≤', e.g., 'speed > 100' searches for all Pokemon equal to and greater than 100 speed.",
		"Parameters can be excluded through the use of '!', e.g., '!water type' excludes all water types.",
		"The parameter 'mega' can be added to search for Mega Evolutions only, and the parameter 'NFE' can be added to search not-fully evolved Pokemon only.",
		"The order of the parameters does not matter."],

	rollpokemon: 'randompokemon',
	randpoke: 'randompokemon',
	randompokemon: function (target, room, user, connection, cmd, message) {
		var targets = target.split(",");
		var targetsBuffer = [];
		var qty;
		for (var i = 0; i < targets.length; i++) {
			if (!targets[i]) continue;
			var num = Number(targets[i]);
			if (Number.isInteger(num)) {
				if (qty) return this.sendReply("Only specify the number of Pok\u00e9mon once.");
				qty = num;
				if (qty < 1 || 15 < qty) return this.sendReply("Number of random Pok\u00e9mon must be between 1 and 15.");
				targetsBuffer.push("random" + qty);
			} else {
				targetsBuffer.push(targets[i]);
			}
		}
		if (!qty) targetsBuffer.push("random1");

		CommandParser.commands.dexsearch.call(this, targetsBuffer.join(","), room, user, connection, "randpoke", message);
	},
	randompokemonhelp: ["/randompokemon - Generates random Pok\u00e9mon based on given search conditions.",
		"/randompokemon uses the same parameters as /dexsearch (see '/help ds').",
		"Adding a number as a parameter returns that many random Pok\u00e9mon, e.g., '/randpoke 6' returns 6 random Pok\u00e9mon."],

	ms: 'movesearch',
	msearch: 'movesearch',
	movesearch: function (target, room, user, connection, cmd, message) {
		if (!this.canBroadcast()) return;

		if (!target) return this.parse('/help movesearch');
		var targets = target.split(',');
		var searches = {};
		var allCategories = {'physical':1, 'special':1, 'status':1};
		var allProperties = {'basePower':1, 'accuracy':1, 'priority':1, 'pp':1};
		var allFlags = {'authentic':1, 'bite':1, 'bullet':1, 'contact':1, 'defrost':1, 'powder':1, 'pulse':1, 'punch':1, 'secondary':1, 'snatch':1, 'sound':1};
		var allStatus = {'psn':1, 'tox':1, 'brn':1, 'par':1, 'frz':1, 'slp':1};
		var allVolatileStatus = {'flinch':1, 'confusion':1, 'partiallytrapped':1};
		var allBoosts = {'hp':1, 'atk':1, 'def':1, 'spa':1, 'spd':1, 'spe':1, 'accuracy':1, 'evasion':1};
		var showAll = false;
		var lsetData = {};
		var targetMon = '';

		for (var i = 0; i < targets.length; i++) {
			var isNotSearch = false;
			target = targets[i].toLowerCase().trim();
			if (target.charAt(0) === '!') {
				isNotSearch = true;
				target = target.substr(1);
			}

			var typeIndex = target.indexOf(' type');
			if (typeIndex >= 0) {
				target = target.charAt(0).toUpperCase() + target.substring(1, typeIndex);
				if (!(target in Tools.data.TypeChart)) return this.sendReplyBox("Type '" + Tools.escapeHTML(target) + "' not found.");
				if (!searches['type']) searches['type'] = {};
				if ((searches['type'][target] && isNotSearch) || (searches['type'][target] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include a type.');
				searches['type'][target] = !isNotSearch;
				continue;
			}

			if (target in allCategories) {
				target = target.charAt(0).toUpperCase() + target.substr(1);
				if (!searches['category']) searches['category'] = {};
				if ((searches['category'][target] && isNotSearch) || (searches['category'][target] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include a category.');
				searches['category'][target] = !isNotSearch;
				continue;
			}

			if (target === 'bypassessubstitute') target = 'authentic';
			if (target in allFlags) {
				if (!searches['flags']) searches['flags'] = {};
				if ((searches['flags'][target] && isNotSearch) || (searches['flags'][target] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include \'' + target + '\'.');
				searches['flags'][target] = !isNotSearch;
				continue;
			}

			if (target === 'all') {
				if (this.broadcasting) return this.sendReplyBox("A search with the parameter 'all' cannot be broadcast.");
				showAll = true;
				continue;
			}

			if (target === 'recovery') {
				if (!searches['recovery']) {
					searches['recovery'] = !isNotSearch;
				} else if ((searches['recovery'] && isNotSearch) || (searches['recovery'] === false && !isNotSearch)) {
					return this.sendReplyBox('A search cannot both exclude and include recovery moves.');
				}
				continue;
			}

			var template = Tools.getTemplate(target);
			if (template.exists) {
				if (Object.size(lsetData) !== 0) return this.sendReplyBox("A search can only include one Pok\u00e9mon learnset.");
				if (!template.learnset) template = Tools.getTemplate(template.baseSpecies);
				lsetData = template.learnset;
				targetMon = template.name;
				while (template.prevo) {
					template = Tools.getTemplate(template.prevo);
					for (var move in template.learnset) {
						if (!lsetData[move]) lsetData[move] = template.learnset[move];
					}
				}
				continue;
			}

			var inequality = target.search(/>|<|=/);
			if (inequality >= 0) {
				if (isNotSearch) return this.sendReplyBox("You cannot use the negation symbol '!' in quality ranges.");
				inequality = target.charAt(inequality);
				var targetParts = target.replace(/\s/g, '').split(inequality);
				var numSide, propSide, direction;
				if (!isNaN(targetParts[0])) {
					numSide = 0;
					propSide = 1;
					switch (inequality) {
					case '>': direction = 'less'; break;
					case '<': direction = 'greater'; break;
					case '=': direction = 'equal'; break;
					}
				} else if (!isNaN(targetParts[1])) {
					numSide = 1;
					propSide = 0;
					switch (inequality) {
					case '<': direction = 'less'; break;
					case '>': direction = 'greater'; break;
					case '=': direction = 'equal'; break;
					}
				} else {
					return this.sendReplyBox("No value given to compare with '" + Tools.escapeHTML(target) + "'.");
				}
				var prop = targetParts[propSide];
				switch (toId(targetParts[propSide])) {
				case 'basepower': prop = 'basePower'; break;
				case 'bp': prop = 'basePower'; break;
				case 'acc': prop = 'accuracy'; break;
				}
				if (!(prop in allProperties)) return this.sendReplyBox("'" + Tools.escapeHTML(target) + "' did not contain a valid property.");
				if (!searches['property']) searches['property'] = {};
				if (direction === 'equal') {
					if (searches['property'][prop]) return this.sendReplyBox("Invalid property range for " + prop + ".");
					searches['property'][prop] = {};
					searches['property'][prop]['less'] = parseFloat(targetParts[numSide]);
					searches['property'][prop]['greater'] = parseFloat(targetParts[numSide]);
				} else {
					if (!searches['property'][prop]) searches['property'][prop] = {};
					if (searches['property'][prop][direction]) {
						return this.sendReplyBox("Invalid property range for " + prop + ".");
					} else {
						searches['property'][prop][direction] = parseFloat(targetParts[numSide]);
					}
				}
				continue;
			}

			if (target.substr(0, 8) === 'priority') {
				var sign = '';
				target = target.substr(8).trim();
				if (target === "+") {
					sign = 'greater';
				} else if (target === "-") {
					sign = 'less';
				} else {
					return this.sendReplyBox("Priority type '" + target + "' not recognized.");
				}
				if (!searches['property']) searches['property'] = {};
				if (searches['property']['priority']) {
					return this.sendReplyBox("Priority cannot be set with both shorthand and inequality range.");
				} else {
					searches['property']['priority'] = {};
					searches['property']['priority'][sign] = (sign === 'less' ? -1 : 1);
				}
				continue;
			}

			if (target.substr(0, 7) === 'boosts ') {
				switch (target.substr(7)) {
				case 'attack': target = 'atk'; break;
				case 'defense': target = 'def'; break;
				case 'specialattack': target = 'spa'; break;
				case 'spatk': target = 'spa'; break;
				case 'specialdefense': target = 'spd'; break;
				case 'spdef': target = 'spd'; break;
				case 'speed': target = 'spe'; break;
				case 'acc': target = 'accuracy'; break;
				case 'evasiveness': target = 'evasion'; break;
				default: target = target.substr(7);
				}
				if (!(target in allBoosts)) return this.sendReplyBox("'" + Tools.escapeHTML(target.substr(7)) + "' is not a recognized stat.");
				if (!searches['boost']) searches['boost'] = {};
				if ((searches['boost'][target] && isNotSearch) || (searches['boost'][target] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include a stat boost.');
				searches['boost'][target] = !isNotSearch;
				continue;
			}

			var oldTarget = target;
			if (target.charAt(target.length - 1) === 's') target = target.substr(0, target.length - 1);
			switch (target) {
			case 'toxic': target = 'tox'; break;
			case 'poison': target = 'psn'; break;
			case 'burn': target = 'brn'; break;
			case 'paralyze': target = 'par'; break;
			case 'freeze': target = 'frz'; break;
			case 'sleep': target = 'slp'; break;
			case 'confuse': target = 'confusion'; break;
			case 'trap': target = 'partiallytrapped'; break;
			case 'flinche': target = 'flinch'; break;
			}

			if (target in allStatus) {
				if (!searches['status']) searches['status'] = {};
				if ((searches['status'][target] && isNotSearch) || (searches['status'][target] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include a status.');
				searches['status'][target] = !isNotSearch;
				continue;
			}

			if (target in allVolatileStatus) {
				if (!searches['volatileStatus']) searches['volatileStatus'] = {};
				if ((searches['volatileStatus'][target] && isNotSearch) || (searches['volatileStatus'][target] === false && !isNotSearch)) return this.sendReplyBox('A search cannot both exclude and include a volitile status.');
				searches['volatileStatus'][target] = !isNotSearch;
				continue;
			}

			return this.sendReplyBox("'" + Tools.escapeHTML(oldTarget) + "' could not be found in any of the search categories.");
		}

		if (showAll && Object.size(searches) === 0 && !targetMon) return this.sendReplyBox("No search parameters other than 'all' were found. Try '/help movesearch' for more information on this command.");

		var dex = {};
		if (targetMon) {
			for (var move in lsetData) {
				dex[move] = Tools.getMove(move);
			}
		} else {
			for (var move in Tools.data.Movedex) {
				dex[move] = Tools.getMove(move);
			}
			delete dex.magikarpsrevenge;
		}

		for (var search in searches) {
			switch (search) {
			case 'type':
			case 'category':
				for (var move in dex) {
					if (searches[search][String(dex[move][search])] === false ||
						Object.count(searches[search], true) > 0 && !searches[search][String(dex[move][search])]) {
						delete dex[move];
					}
				}
				break;

			case 'flags':
				for (var flag in searches[search]) {
					for (var move in dex) {
						if (flag !== 'secondary') {
							if ((!dex[move].flags[flag] && searches[search][flag]) || (dex[move].flags[flag] && !searches[search][flag])) delete dex[move];
						} else {
							if (searches[search][flag]) {
								if (!dex[move].secondary && !dex[move].secondaries) delete dex[move];
							} else {
								if (dex[move].secondary && dex[move].secondaries) delete dex[move];
							}
						}
					}
				}
				break;

			case 'recovery':
				for (var move in dex) {
					var hasRecovery = (dex[move].drain || dex[move].flags.heal);
					if ((!hasRecovery && searches[search]) || (hasRecovery && !searches[search])) delete dex[move];
				}
				break;

			case 'property':
				for (var prop in searches[search]) {
					for (var move in dex) {
						if (typeof searches[search][prop].less === "number") {
							if (dex[move][prop] === true) {
								delete dex[move];
								continue;
							}
							if (dex[move][prop] > searches[search][prop].less) {
								delete dex[move];
								continue;
							}
						}
						if (typeof searches[search][prop].greater === "number") {
							if (dex[move][prop] === true) {
								if (dex[move].category === "Status") delete dex[move];
								continue;
							}
							if (dex[move][prop] < searches[search][prop].greater) {
								delete dex[move];
								continue;
							}
						}
					}
				}
				break;

			case 'boost':
				for (var boost in searches[search]) {
					for (var move in dex) {
						if (dex[move].boosts) {
							if ((dex[move].boosts[boost] > 0 && searches[search][boost]) ||
								(dex[move].boosts[boost] < 1 && !searches[search][boost])) continue;
						} else if (dex[move].secondary && dex[move].secondary.self && dex[move].secondary.self.boosts) {
							if ((dex[move].secondary.self.boosts[boost] > 0 && searches[search][boost]) ||
								(dex[move].secondary.self.boosts[boost] < 1 && !searches[search][boost])) continue;
						}
						delete dex[move];
					}
				}
				break;

			case 'status':
			case 'volatileStatus':
				for (var searchStatus in searches[search]) {
					for (var move in dex) {
						if (dex[move][search] !== searchStatus) {
							if (!dex[move].secondaries) {
								if (!dex[move].secondary) {
									if (searches[search][searchStatus]) delete dex[move];
								} else {
									if ((dex[move].secondary[search] !== searchStatus && searches[search][searchStatus]) ||
										(dex[move].secondary[search] === searchStatus && !searches[search][searchStatus])) delete dex[move];
								}
							} else {
								var hasSecondary = false;
								for (var i = 0; i < dex[move].secondaries.length; i++) {
									if (dex[move].secondaries[i][search] === searchStatus) hasSecondary = true;
								}
								if ((!hasSecondary && searches[search][searchStatus]) || (hasSecondary && !searches[search][searchStatus])) delete dex[move];
							}
						} else {
							if (!searches[search][searchStatus]) delete dex[move];
						}
					}
				}
				break;

			default:
				throw new Error("/movesearch search category '" + search + "' was unrecognised.");
			}
		}

		var results = [];
		for (var move in dex) {
			results.push(dex[move].name);
		}

		var resultsStr = "";
		if (targetMon) {
			resultsStr += "<font color=#999999>Matching moves found in learnset for</font> " + targetMon + ":<br>";
		} else {
			resultsStr += this.broadcasting ? "" : ("<font color=#999999>" + message + ":</font><br>");
		}
		if (results.length > 0) {
			if (showAll || results.length <= RESULTS_MAX_LENGTH + 5) {
				results.sort();
				resultsStr += results.join(", ");
			} else {
				resultsStr += results.slice(0, RESULTS_MAX_LENGTH).join(", ") + ", and " + (results.length - RESULTS_MAX_LENGTH) + " more. <font color=#999999>Redo the search with 'all' as a search parameter to show all results.</font>";
			}
		} else {
			resultsStr += "No moves found.";
		}
		return this.sendReplyBox(resultsStr);
	},
	movesearchhelp: ["/movesearch [parameter], [parameter], [parameter], ... - Searches for moves that fulfill the selected criteria.",
		"Search categories are: type, category, flag, status inflicted, type boosted, and numeric range for base power, pp, and accuracy.",
		"Types must be followed by ' type', e.g., 'dragon type'.",
		"Stat boosts must be preceded with 'boosts ', e.g., 'boosts attack' searches for moves that boost the attack stat.",
		"Inequality ranges use the characters '>' and '<' though they behave as '≥' and '≤', e.g., 'bp > 100' searches for all moves equal to and greater than 100 base power.",
		"Parameters can be excluded through the use of '!', e.g., !water type' excludes all water type moves.",
		"Valid flags are: authentic (bypasses substitute), bite, bullet, contact, defrost, powder, pulse, punch, secondary, snatch, sound",
		"If a Pok\u00e9mon is included as a parameter, moves will be searched from it's movepool.",
		"The order of the parameters does not matter."],

	itemsearch: function (target, room, user, connection, cmd, message) {
		if (!target) return this.parse('/help itemsearch');
		if (!this.canBroadcast()) return;

		var showAll = false;

		target = target.trim();
		if (target.substr(target.length - 5) === ', all' || target.substr(target.length - 4) === ',all') {
			showAll = true;
			target = target.substr(0, target.length - 5);
		}

		target = target.toLowerCase().replace('-', ' ').replace(/[^a-z0-9.\s\/]/g, '');
		var rawSearch = target.split(' ');
		var searchedWords = [];
		var foundItems = [];

		//refine searched words
		for (var i = 0; i < rawSearch.length; i++) {
			var newWord = rawSearch[i].trim();
			if (isNaN(newWord)) newWord = newWord.replace('.', '');
			switch (newWord) {
			// words that don't really help identify item removed to speed up search
			case 'a':
			case 'an':
			case 'is':
			case 'it':
			case 'its':
			case 'the':
			case 'that':
			case 'which':
			case 'user':
			case 'holder':
			case 'holders':
				newWord = '';
				break;
			// replace variations of common words with standardized versions
			case 'opponent': newWord = 'attacker'; break;
			case 'flung': newWord = 'fling'; break;
			case 'heal': case 'heals':
			case 'recovers': newWord = 'restores'; break;
			case 'boost':
			case 'boosts': newWord = 'raises'; break;
			case 'weakens': newWord = 'halves'; break;
			case 'more': newWord = 'increases'; break;
			case 'super':
				if (rawSearch[i + 1] === 'effective') {
					newWord = 'supereffective';
					rawSearch.splice(i + 1, 1);
				}
				break;
			case 'special': newWord = 'sp'; break;
			case 'spa':
				newWord = 'sp';
				rawSearch.splice(i, 0, 'atk');
				break;
			case 'atk':
			case 'attack':
				if (rawSearch[i - 1] === 'sp') {
					newWord = 'atk';
				} else {
					newWord = 'attack';
				}
				break;
			case 'spd':
				newWord = 'sp';
				rawSearch.splice(i, 0, 'def');
				break;
			case 'def':
			case 'defense':
				if (rawSearch[i - 1] === 'sp') {
					newWord = 'def';
				} else {
					newWord = 'defense';
				}
				break;
			case 'burns': newWord = 'burn'; break;
			case 'poisons': newWord = 'poison'; break;
			default:
				if (/x[\d\.]+/.test(newWord)) {
					newWord = newWord.substr(1) + 'x';
				}
			}
			if (!newWord || searchedWords.indexOf(newWord) >= 0) continue;
			searchedWords.push(newWord);
		}

		if (searchedWords.length === 0) return this.sendReplyBox("No distinguishing words were used. Try a more specific search.");

		if (searchedWords.indexOf('fling') >= 0) {
			var basePower = 0;
			var effect;

			for (var k = 0; k < searchedWords.length; k++) {
				var wordEff = "";
				switch (searchedWords[k]) {
				case 'burn': case 'burns':
				case 'brn': wordEff = 'brn'; break;
				case 'paralyze': case 'paralyzes':
				case 'par': wordEff = 'par'; break;
				case 'poison': case 'poisons':
				case 'psn': wordEff = 'psn'; break;
				case 'toxic':
				case 'tox': wordEff = 'tox'; break;
				case 'flinches':
				case 'flinch': wordEff = 'flinch'; break;
				case 'badly': wordEff = 'tox'; break;
				}
				if (wordEff && effect) {
					if (!(wordEff === 'psn' && effect === 'tox')) return this.sendReplyBox("Only specify fling effect once.");
				} else if (wordEff) {
					effect = wordEff;
				} else {
					if (searchedWords[k].substr(searchedWords[k].length - 2) === 'bp' && searchedWords[k].length > 2) searchedWords[k] = searchedWords[k].substr(0, searchedWords[k].length - 2);
					if (Number.isInteger(Number(searchedWords[k]))) {
						if (basePower) return this.sendReplyBox("Only specify a number for base power once.");
						basePower = parseInt(searchedWords[k]);
					}
				}
			}

			for (var n in Tools.data.Items) {
				var item = Tools.getItem(n);
				if (!item.fling) continue;

				if (basePower && effect) {
					if (item.fling.basePower === basePower &&
					(item.fling.status === effect || item.fling.volatileStatus === effect)) foundItems.push(item.name);
				} else if (basePower) {
					if (item.fling.basePower === basePower) foundItems.push(item.name);
				} else {
					if (item.fling.status === effect || item.fling.volatileStatus === effect) foundItems.push(item.name);
				}
			}
			if (foundItems.length === 0) return this.sendReplyBox('No items inflict ' + basePower + 'bp damage when used with Fling.');
		} else if (target.search(/natural ?gift/i) >= 0) {
			var basePower = 0;
			var type = "";

			for (var k = 0; k < searchedWords.length; k++) {
				searchedWords[k] = searchedWords[k].capitalize();
				if (searchedWords[k] in Tools.data.TypeChart) {
					if (type) return this.sendReplyBox("Only specify natural gift type once.");
					type = searchedWords[k];
				} else {
					if (searchedWords[k].substr(searchedWords[k].length - 2) === 'bp' && searchedWords[k].length > 2) searchedWords[k] = searchedWords[k].substr(0, searchedWords[k].length - 2);
					if (Number.isInteger(Number(searchedWords[k]))) {
						if (basePower) return this.sendReplyBox("Only specify a number for base power once.");
						basePower = parseInt(searchedWords[k]);
					}
				}
			}

			for (var n in Tools.data.Items) {
				var item = Tools.getItem(n);
				if (!item.isBerry) continue;

				if (basePower && type) {
					if (item.naturalGift.basePower === basePower && item.naturalGift.type === type) foundItems.push(item.name);
				} else if (basePower) {
					if (item.naturalGift.basePower === basePower) foundItems.push(item.name);
				} else {
					if (item.naturalGift.type === type) foundItems.push(item.name);
				}
			}
			if (foundItems.length === 0) return this.sendReplyBox('No berries inflict ' + basePower + 'bp damage when used with Natural Gift.');
		} else {
			var bestMatched = 0;
			for (var n in Tools.data.Items) {
				var item = Tools.getItem(n);
				var matched = 0;
				// splits words in the description into a toId()-esk format except retaining / and . in numbers
				var descWords = item.desc;
				// add more general quantifier words to descriptions
				if (/[1-9\.]+x/.test(descWords)) descWords += ' increases';
				if (item.isBerry) descWords += ' berry';
				descWords = descWords.replace(/super[\-\s]effective/g, 'supereffective');
				descWords = descWords.toLowerCase().replace('-', ' ').replace(/[^a-z0-9\s\/]/g, '').replace(/(\D)\./, function (p0, p1) { return p1; }).split(' ');

				for (var k = 0; k < searchedWords.length; k++) {
					if (descWords.indexOf(searchedWords[k]) >= 0) matched++;
				}

				if (matched >= bestMatched && matched >= (searchedWords.length * 3 / 5)) foundItems.push(item.name);
				if (matched > bestMatched) bestMatched = matched;
			}

			// iterate over found items again to make sure they all are the best match
			for (var l = 0; l < foundItems.length; l++) {
				var item = Tools.getItem(foundItems[l]);
				var matched = 0;
				var descWords = item.desc;
				if (/[1-9\.]+x/.test(descWords)) descWords += ' increases';
				if (item.isBerry) descWords += ' berry';
				descWords = descWords.replace(/super[\-\s]effective/g, 'supereffective');
				descWords = descWords.toLowerCase().replace('-', ' ').replace(/[^a-z0-9\s\/]/g, '').replace(/(\D)\./, function (p0, p1) { return p1; }).split(' ');

				for (var k = 0; k < searchedWords.length; k++) {
					if (descWords.indexOf(searchedWords[k]) >= 0) matched++;
				}

				if (matched !== bestMatched) {
					foundItems.splice(l, 1);
					l--;
				}
			}
		}

		var resultsStr = this.broadcasting ? "" : ("<font color=#999999>" + message + ":</font><br>");
		if (foundItems.length > 0) {
			if (showAll || foundItems.length <= RESULTS_MAX_LENGTH + 5) {
				foundItems.sort();
				resultsStr += foundItems.join(", ");
			} else {
				resultsStr += foundItems.slice(0, RESULTS_MAX_LENGTH).join(", ") + ", and " + (foundItems.length - RESULTS_MAX_LENGTH) + " more. <font color=#999999>Redo the search with ', all' at the end to show all results.</font>";
			}
		} else {
			resultsStr += "No items found. Try a more general search";
		}
		return this.sendReplyBox(resultsStr);
	},
	itemsearchhelp: ["/itemsearch [move description] - finds items that match the given key words.",
	"Command accepts natural language. (tip: fewer words tend to work better)",
	"Searches with \"fling\" in them will find items with the specified Fling behavior.",
	"Searches with \"natural gift\" in them will find items with the specified Natural Gift behavior."],

	learnset: 'learn',
	learnall: 'learn',
	learn5: 'learn',
	g6learn: 'learn',
	rbylearn: 'learn',
	gsclearn: 'learn',
	advlearn: 'learn',
	dpplearn: 'learn',
	bw2learn: 'learn',
	learn: function (target, room, user, connection, cmd) {
		if (!target) return this.parse('/help learn');

		if (!this.canBroadcast()) return;

		var lsetData = {set:{}};
		var targets = target.split(',');
		var template = Tools.getTemplate(targets[0]);
		var move = {};
		var problem;
		var format = {rby:'gen1ou', gsc:'gen2ou', adv:'gen3ou', dpp:'gen4ou', bw2:'gen5ou'}[cmd.substring(0, 3)];
		var all = (cmd === 'learnall');
		if (cmd === 'learn5') lsetData.set.level = 5;
		if (cmd === 'g6learn') lsetData.format = {noPokebank: true};

		if (!template.exists) {
			return this.sendReply("Pok\u00e9mon '" + template.id + "' not found.");
		}

		if (targets.length < 2) {
			return this.sendReply("You must specify at least one move.");
		}

		for (var i = 1, len = targets.length; i < len; ++i) {
			move = Tools.getMove(targets[i]);
			if (!move.exists) {
				return this.sendReply("Move '" + move.id + "' not found.");
			}
			problem = TeamValidator.checkLearnsetSync(format, move, template.species, lsetData);
			if (problem) break;
		}
		var buffer = template.name + (problem ? " <span class=\"message-learn-cannotlearn\">can't</span> learn " : " <span class=\"message-learn-canlearn\">can</span> learn ") + (targets.length > 2 ? "these moves" : move.name);
		if (format) buffer += ' on ' + cmd.substring(0, 3).toUpperCase();
		if (!problem) {
			var sourceNames = {E:"egg", S:"event", D:"dream world"};
			if (lsetData.sources || lsetData.sourcesBefore) buffer += " only when obtained from:<ul class=\"message-learn-list\">";
			if (lsetData.sources) {
				var sources = lsetData.sources.sort();
				var prevSource;
				var prevSourceType;
				var prevSourceCount = 0;
				for (var i = 0, len = sources.length; i < len; ++i) {
					var source = sources[i];
					if (source.substr(0, 2) === prevSourceType) {
						if (prevSourceCount < 0) {
							buffer += ": " + source.substr(2);
						} else if (all || prevSourceCount < 3) {
							buffer += ", " + source.substr(2);
						} else if (prevSourceCount === 3) {
							buffer += ", ...";
						}
						++prevSourceCount;
						continue;
					}
					prevSourceType = source.substr(0, 2);
					prevSourceCount = source.substr(2) ? 0 : -1;
					buffer += "<li>gen " + source.charAt(0) + " " + sourceNames[source.charAt(1)];
					if (prevSourceType === '5E' && template.maleOnlyHidden) buffer += " (cannot have hidden ability)";
					if (source.substr(2)) buffer += ": " + source.substr(2);
				}
			}
			if (lsetData.sourcesBefore) {
				if (!(cmd.substring(0, 3) in {'rby':1, 'gsc':1})) {
					buffer += "<li>any generation before " + (lsetData.sourcesBefore + 1);
				} else if (!lsetData.sources) {
					buffer += "<li>gen " + lsetData.sourcesBefore;
				}
			}
			buffer += "</ul>";
		}
		this.sendReplyBox(buffer);
	},
	learnhelp: ["/learn [pokemon], [move, move, ...] - Displays how a Pok\u00e9mon can learn the given moves, if it can at all.",
		"!learn [pokemon], [move, move, ...] - Show everyone that information. Requires: + % @ # & ~"],

	weaknesses: 'weakness',
	weak: 'weakness',
	resist: 'weakness',
	weakness: function (target, room, user) {
		if (!target) return this.parse('/help weakness');
		if (!this.canBroadcast()) return;
		target = target.trim();
		var targets = target.split(/ ?[,\/ ] ?/);

		var pokemon = Tools.getTemplate(target);
		var type1 = Tools.getType(targets[0]);
		var type2 = Tools.getType(targets[1]);

		if (pokemon.exists) {
			target = pokemon.species;
		} else if (type1.exists && type2.exists && type1 !== type2) {
			pokemon = {types: [type1.id, type2.id]};
			target = type1.id + "/" + type2.id;
		} else if (type1.exists) {
			pokemon = {types: [type1.id]};
			target = type1.id;
		} else {
			return this.sendReplyBox("" + Tools.escapeHTML(target) + " isn't a recognized type or pokemon.");
		}

		var weaknesses = [];
		var resistances = [];
		var immunities = [];
		Object.keys(Tools.data.TypeChart).forEach(function (type) {
			var notImmune = Tools.getImmunity(type, pokemon);
			if (notImmune) {
				var typeMod = Tools.getEffectiveness(type, pokemon);
				switch (typeMod) {
				case 1:
					weaknesses.push(type);
					break;
				case 2:
					weaknesses.push("<b>" + type + "</b>");
					break;
				case -1:
					resistances.push(type);
					break;
				case -2:
					resistances.push("<b>" + type + "</b>");
					break;
				}
			} else {
				immunities.push(type);
			}
		});

		var buffer = [];
		buffer.push(pokemon.exists ? "" + target + ' (ignoring abilities):' : '' + target + ':');
		buffer.push('<span class="message-effect-weak">Weaknesses</span>: ' + (weaknesses.join(', ') || '<font color=#999999>None</font>'));
		buffer.push('<span class="message-effect-resist">Resistances</span>: ' + (resistances.join(', ') || '<font color=#999999>None</font>'));
		buffer.push('<span class="message-effect-immune">Immunities</span>: ' + (immunities.join(', ') || '<font color=#999999>None</font>'));
		this.sendReplyBox(buffer.join('<br>'));
	},
	weaknesshelp: ["/weakness [pokemon] - Provides a Pok\u00e9mon's resistances, weaknesses, and immunities, ignoring abilities.",
		"/weakness [type 1]/[type 2] - Provides a type or type combination's resistances, weaknesses, and immunities, ignoring abilities.",
		"!weakness [pokemon] - Shows everyone a Pok\u00e9mon's resistances, weaknesses, and immunities, ignoring abilities. Requires: + % @ # & ~",
		"!weakness [type 1]/[type 2] - Shows everyone a type or type combination's resistances, weaknesses, and immunities, ignoring abilities. Requires: + % @ # & ~"],

	eff: 'effectiveness',
	type: 'effectiveness',
	matchup: 'effectiveness',
	effectiveness: function (target, room, user) {
		var targets = target.split(/[,/]/).slice(0, 2);
		if (targets.length !== 2) return this.sendReply("Attacker and defender must be separated with a comma.");

		var searchMethods = {'getType':1, 'getMove':1, 'getTemplate':1};
		var sourceMethods = {'getType':1, 'getMove':1};
		var targetMethods = {'getType':1, 'getTemplate':1};
		var source, defender, foundData, atkName, defName;

		for (var i = 0; i < 2; ++i) {
			var method;
			for (method in searchMethods) {
				foundData = Tools[method](targets[i]);
				if (foundData.exists) break;
			}
			if (!foundData.exists) return this.parse('/help effectiveness');
			if (!source && method in sourceMethods) {
				if (foundData.type) {
					source = foundData;
					atkName = foundData.name;
				} else {
					source = foundData.id;
					atkName = foundData.id;
				}
				searchMethods = targetMethods;
			} else if (!defender && method in targetMethods) {
				if (foundData.types) {
					defender = foundData;
					defName = foundData.species + " (not counting abilities)";
				} else {
					defender = {types: [foundData.id]};
					defName = foundData.id;
				}
				searchMethods = sourceMethods;
			}
		}

		if (!this.canBroadcast()) return;

		var factor = 0;
		if (Tools.getImmunity(source, defender) || source.ignoreImmunity && (source.ignoreImmunity === true || source.ignoreImmunity[source.type])) {
			var totalTypeMod = 0;
			if (source.effectType !== 'Move' || source.category !== 'Status' && (source.basePower || source.basePowerCallback)) {
				for (var i = 0; i < defender.types.length; i++) {
					var baseMod = Tools.getEffectiveness(source, defender.types[i]);
					var moveMod = source.onEffectiveness && source.onEffectiveness.call(Tools, baseMod, defender.types[i], source);
					totalTypeMod += typeof moveMod === 'number' ? moveMod : baseMod;
				}
			}
			factor = Math.pow(2, totalTypeMod);
		}

		var hasThousandArrows = source.id === 'thousandarrows' && defender.types.indexOf('Flying') >= 0;
		var additionalInfo = hasThousandArrows ? "<br>However, Thousand Arrows will be 1x effective on the first hit." : "";

		this.sendReplyBox("" + atkName + " is " + factor + "x effective against " + defName + "." + additionalInfo);
	},
	effectivenesshelp: ["/effectiveness [attack], [defender] - Provides the effectiveness of a move or type on another type or a Pok\u00e9mon.",
		"!effectiveness [attack], [defender] - Shows everyone the effectiveness of a move or type on another type or a Pok\u00e9mon."],

	cover: 'coverage',
	coverage: function (target, room, user) {
		if (!this.canBroadcast()) return;
		if (!target) return this.parse("/help coverage");

		var targets = target.split(/[,+]/);
		var sources = [];

		var dispTable = false;
		var bestCoverage = {};
		var hasThousandArrows = false;

		for (var type in Tools.data.TypeChart) {
			// This command uses -5 to designate immunity
			bestCoverage[type] = -5;
		}

		for (var i = 0; i < targets.length; i++) {
			var move = targets[i].trim().capitalize();
			if (move === 'Table' || move === 'All') {
				if (this.broadcasting) return this.sendReplyBox("The full table cannot be broadcast.");
				dispTable = true;
				continue;
			}

			var eff;
			if (move in Tools.data.TypeChart) {
				sources.push(move);
				for (var type in bestCoverage) {
					if (!Tools.getImmunity(move, type) && !move.ignoreImmunity) continue;
					eff = Tools.getEffectiveness(move, type);
					if (eff > bestCoverage[type]) bestCoverage[type] = eff;
				}
				continue;
			}
			move = Tools.getMove(move);
			if (move.exists) {
				if (!move.basePower && !move.basePowerCallback) continue;
				if (move.id === 'thousandarrows') hasThousandArrows = true;
				sources.push(move);
				for (var type in bestCoverage) {
					if (move.id === "struggle") {
						eff = 0;
					} else {
						if (!Tools.getImmunity(move.type, type) && !move.ignoreImmunity) continue;
						var baseMod = Tools.getEffectiveness(move, type);
						var moveMod = move.onEffectiveness && move.onEffectiveness.call(Tools, baseMod, type, move);
						eff = typeof moveMod === 'number' ? moveMod : baseMod;
					}
					if (eff > bestCoverage[type]) bestCoverage[type] = eff;
				}
				continue;
			}

			return this.sendReply("No type or move '" + targets[i] + "' found.");
		}
		if (sources.length === 0) return this.sendReply("No moves using a type table for determining damage were specified.");
		if (sources.length > 4) return this.sendReply("Specify a maximum of 4 moves or types.");

		// converts to fractional effectiveness, 0 for immune
		for (var type in bestCoverage) {
			if (bestCoverage[type] === -5) {
				bestCoverage[type] = 0;
				continue;
			}
			bestCoverage[type] = Math.pow(2, bestCoverage[type]);
		}

		if (!dispTable) {
			var buffer = [];
			var superEff = [];
			var neutral = [];
			var resists = [];
			var immune = [];

			for (var type in bestCoverage) {
				switch (bestCoverage[type]) {
				case 0:
					immune.push(type);
					break;
				case 0.25:
				case 0.5:
					resists.push(type);
					break;
				case 1:
					neutral.push(type);
					break;
				case 2:
				case 4:
					superEff.push(type);
					break;
				default:
					throw new Error("/coverage effectiveness of " + bestCoverage[type] + " from parameters: " + target);
				}
			}
			buffer.push('Coverage for ' + sources.join(' + ') + ':');
			buffer.push('<b><font color=#559955>Super Effective</font></b>: ' + (superEff.join(', ') || '<font color=#999999>None</font>'));
			buffer.push('<span class="message-effect-resist">Neutral</span>: ' + (neutral.join(', ') || '<font color=#999999>None</font>'));
			buffer.push('<span class="message-effect-weak">Resists</span>: ' + (resists.join(', ') || '<font color=#999999>None</font>'));
			buffer.push('<span class="message-effect-immune">Immunities</span>: ' + (immune.join(', ') || '<font color=#999999>None</font>'));
			return this.sendReplyBox(buffer.join('<br>'));
		} else {
			var buffer = '<div class="scrollable"><table cellpadding="1" width="100%"><tr><th></th>';
			var icon = {};
			for (var type in Tools.data.TypeChart) {
				icon[type] = '<img src="https://play.pokemonshowdown.com/sprites/types/' + type + '.png" width="32" height="14">';
				// row of icons at top
				buffer += '<th>' + icon[type] + '</th>';
			}
			buffer += '</tr>';
			for (var type1 in Tools.data.TypeChart) {
				// assembles the rest of the rows
				buffer += '<tr><th>' + icon[type1] + '</th>';
				for (var type2 in Tools.data.TypeChart) {
					var typing;
					var cell = '<th ';
					var bestEff = -5;
					if (type1 === type2) {
						// when types are the same it's considered pure type
						typing = type1;
						bestEff = bestCoverage[type1];
					} else {
						typing = type1 + "/" + type2;
						for (var i = 0; i < sources.length; i++) {
							var move = sources[i];

							var curEff = 0;
							if ((!Tools.getImmunity((move.type || move), type1) || !Tools.getImmunity((move.type || move), type2)) && !move.ignoreImmunity) continue;
							var baseMod = Tools.getEffectiveness(move, type1);
							var moveMod = move.onEffectiveness && move.onEffectiveness.call(Tools, baseMod, type1, move);
							curEff += typeof moveMod === 'number' ? moveMod : baseMod;
							baseMod = Tools.getEffectiveness(move, type2);
							moveMod = move.onEffectiveness && move.onEffectiveness.call(Tools, baseMod, type2, move);
							curEff += typeof moveMod === 'number' ? moveMod : baseMod;

							if (curEff > bestEff) bestEff = curEff;
						}
						if (bestEff === -5) {
							bestEff = 0;
						} else {
							bestEff = Math.pow(2, bestEff);
						}
					}
					switch (bestEff) {
					case 0:
						cell += 'bgcolor=#666666 title="' + typing + '"><font color=#000000>' + bestEff + '</font>';
						break;
					case 0.25:
					case 0.5:
						cell += 'bgcolor=#AA5544 title="' + typing + '"><font color=#660000>' + bestEff + '</font>';
						break;
					case 1:
						cell += 'bgcolor=#6688AA title="' + typing + '"><font color=#000066>' + bestEff + '</font>';
						break;
					case 2:
					case 4:
						cell += 'bgcolor=#559955 title="' + typing + '"><font color=#003300>' + bestEff + '</font>';
						break;
					default:
						throw new Error("/coverage effectiveness of " + bestEff + " from parameters: " + target);
					}
					cell += '</th>';
					buffer += cell;
				}
			}
			buffer += '</table></div>';

			if (hasThousandArrows) {
				buffer += "<br><b>Thousand Arrows has neutral type effectiveness on Flying-type Pok\u00e9mon if not already smacked down.";
			}

			this.sendReplyBox('Coverage for ' + sources.join(' + ') + ':<br>' + buffer);
		}
	},
	coveragehelp: ["/coverage [move 1], [move 2] ... - Provides the best effectiveness match-up against all defending types for given moves or attacking types",
		"!coverage [move 1], [move 2] ... - Shows this information to everyone.",
		"Adding the parameter 'all' or 'table' will display the information with a table of all type combinations."],

	/*********************************************************
	 * Informational commands
	 *********************************************************/

	uptime: function (target, room, user) {
		if (!this.canBroadcast()) return;
		var uptime = process.uptime();
		var uptimeText;
		if (uptime > 24 * 60 * 60) {
			var uptimeDays = Math.floor(uptime / (24 * 60 * 60));
			uptimeText = uptimeDays + " " + (uptimeDays === 1 ? "day" : "days");
			var uptimeHours = Math.floor(uptime / (60 * 60)) - uptimeDays * 24;
			if (uptimeHours) uptimeText += ", " + uptimeHours + " " + (uptimeHours === 1 ? "hour" : "hours");
		} else {
			uptimeText = uptime.seconds().duration();
		}
		this.sendReplyBox("Uptime: <b>" + uptimeText + "</b>");
	},

	groups: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox(
			"+ <b>Voice</b> - They can use ! commands like !groups, and talk during moderated chat<br />" +
			"% <b>Driver</b> - The above, and they can mute. Global % can also lock users and check for alts<br />" +
			"@ <b>Moderator</b> - The above, and they can ban users<br />" +
			"&amp; <b>Leader</b> - The above, and they can promote to moderator and force ties<br />" +
			"# <b>Room Owner</b> - They are leaders of the room and can almost totally control it<br />" +
			"~ <b>Administrator</b> - They can do anything, like change what this message says"
		);
	},
	groupshelp: ["/groups - Explains what the + % @ # & next to people's names mean.",
		"!groups - Shows everyone that information. Requires: + % @ # & ~"],

	repo: 'opensource',
	repository: 'opensource',
	git: 'opensource',
	opensource: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox(
			"Pok&eacute;mon Showdown is open source:<br />" +
			"- Language: JavaScript (Node.js or io.js)<br />" +
			"- <a href=\"https://github.com/Zarel/Pokemon-Showdown/commits/master\">What's new?</a><br />" +
			"- <a href=\"https://github.com/Zarel/Pokemon-Showdown\">Server source code</a><br />" +
			"- <a href=\"https://github.com/Zarel/Pokemon-Showdown-Client\">Client source code</a><br />" +
			"- <a href=\"https://github.com/piiiikachuuu/Pokemon-Showdown\">Luster server source code</a>"
		);
	},
	opensourcehelp: ["/opensource - Links to PS's source code repository.",
		"!opensource - Show everyone that information. Requires: + % @ # & ~"],

	forums: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox("<a href=\"http://luster.no-ip.org/forum/index.php\">Luster Forums</a>");
	},

	suggestions: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox("<a href=\"https://www.smogon.com/forums/threads/3534365/\">Make a suggestion for Pok&eacute;mon Showdown</a>");
	},

	bugreport: 'bugs',
	bugs: function (target, room, user) {
		if (!this.canBroadcast()) return;
		if (room.battle) {
			this.sendReplyBox("<center><button name=\"saveReplay\"><i class=\"icon-upload\"></i> Save Replay</button> &mdash; <a href=\"https://www.smogon.com/forums/threads/3520646/\">Questions</a> &mdash; <a href=\"https://www.smogon.com/forums/threads/3469932/\">Bug Reports</a></center>");
		} else {
			this.sendReplyBox(
				"Have a replay showcasing a bug on Pok&eacute;mon Showdown?<br />" +
				"- <a href=\"https://www.smogon.com/forums/threads/3520646/\">Questions</a><br />" +
				"- <a href=\"https://www.smogon.com/forums/threads/3469932/\">Bug Reports</a>"
			);
		}
	},

	avatars: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox("You can <button name=\"avatars\">change your avatar</button> by clicking on it in the <button name=\"openOptions\"><i class=\"icon-cog\"></i> Options</button> menu in the upper right. Custom avatars are only obtainable by staff.");
	},
	avatarshelp: ["/avatars - Explains how to change avatars.",
		"!avatars - Show everyone that information. Requires: + % @ # & ~"],

	introduction: 'intro',
	intro: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox(
			"New to competitive Pok&eacute;mon?<br />" +
			"- <a href=\"https://www.smogon.com/sim/ps_guide\">Beginner's Guide to Pok&eacute;mon Showdown</a><br />" +
			"- <a href=\"https://www.smogon.com/dp/articles/intro_comp_pokemon\">An introduction to competitive Pok&eacute;mon</a><br />" +
			"- <a href=\"https://www.smogon.com/bw/articles/bw_tiers\">What do 'OU', 'UU', etc mean?</a><br />" +
			"- <a href=\"https://www.smogon.com/xyhub/tiers\">What are the rules for each format? What is 'Sleep Clause'?</a>"
		);
	},
	introhelp: ["/intro - Provides an introduction to competitive Pok\u00e9mon.",
		"!intro - Show everyone that information. Requires: + % @ # & ~"],

	mentoring: 'smogintro',
	smogonintro: 'smogintro',
	smogintro: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox(
			"Welcome to Smogon's official simulator! The <a href=\"https://www.smogon.com/forums/forums/264\">Smogon Info / Intro Hub</a> can help you get integrated into the community.<br />" +
			"- <a href=\"https://www.smogon.com/forums/threads/3526346\">Useful Smogon Info</a><br />" +
			"- <a href=\"https://www.smogon.com/forums/threads/3498332\">Tiering FAQ</a><br />"
		);
	},

	calculator: 'calc',
	calc: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox(
			"Pok&eacute;mon Showdown! damage calculator. (Courtesy of Honko)<br />" +
			"- <a href=\"https://pokemonshowdown.com/damagecalc/\">Damage Calculator</a>"
		);
	},
	calchelp: ["/calc - Provides a link to a damage calculator",
		"!calc - Shows everyone a link to a damage calculator. Requires: + % @ # & ~"],

	capintro: 'cap',
	cap: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox(
			"An introduction to the Create-A-Pok&eacute;mon project:<br />" +
			"- <a href=\"https://www.smogon.com/cap/\">CAP project website and description</a><br />" +
			"- <a href=\"https://www.smogon.com/forums/threads/48782/\">What Pok&eacute;mon have been made?</a><br />" +
			"- <a href=\"https://www.smogon.com/forums/forums/311\">Talk about the metagame here</a><br />" +
			"- <a href=\"https://www.smogon.com/forums/threads/3512318/\">Sample XY CAP teams</a>"
		);
	},
	caphelp: ["/cap - Provides an introduction to the Create-A-Pok&eacute;mon project.",
		"!cap - Show everyone that information. Requires: + % @ # & ~"],

	gennext: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox(
			"NEXT (also called Gen-NEXT) is a mod that makes changes to the game:<br />" +
			"- <a href=\"https://github.com/Zarel/Pokemon-Showdown/blob/master/mods/gennext/README.md\">README: overview of NEXT</a><br />" +
			"Example replays:<br />" +
			"- <a href=\"https://replay.pokemonshowdown.com/gennextou-120689854\">Zergo vs Mr Weegle Snarf</a><br />" +
			"- <a href=\"https://replay.pokemonshowdown.com/gennextou-130756055\">NickMP vs Khalogie</a>"
		);
	},

	om: 'othermetas',
	othermetas: function (target, room, user) {
		if (!this.canBroadcast()) return;
		target = toId(target);
		var buffer = "";
		var matched = false;

		if (target === 'all' && this.broadcasting) {
			return this.sendReplyBox("You cannot broadcast information about all Other Metagames at once.");
		}

		if (!target || target === 'all') {
			matched = true;
			buffer += "- <a href=\"https://www.smogon.com/tiers/om/\">Other Metagames Hub</a><br />";
			buffer += "- <a href=\"https://www.smogon.com/forums/threads/3505031/\">Other Metagames Index</a><br />";
			if (!target) return this.sendReplyBox(buffer);
		}
		var showMonthly = (target === 'all' || target === 'omofthemonth' || target === 'omotm' || target === 'month');
		var monthBuffer = "- <a href=\"https://www.smogon.com/forums/threads/3541792/\">Other Metagame of the Month</a>";

		if (target === 'all') {
			// Display OMotM formats, with forum thread links as caption
			this.parse('/formathelp omofthemonth');
			if (showMonthly) this.sendReply('|raw|<center>' + monthBuffer + '</center>');

			// Display the rest of OM formats, with OM hub/index forum links as caption
			this.parse('/formathelp othermetagames');
			return this.sendReply('|raw|<center>' + buffer + '</center>');
		}
		if (showMonthly) {
			this.target = 'omofthemonth';
			this.run('formathelp');
			this.sendReply('|raw|<center>' + monthBuffer + '</center>');
		} else {
			this.run('formathelp');
		}
	},
	othermetashelp: ["/om - Provides links to information on the Other Metagames.",
		"!om - Show everyone that information. Requires: + % @ # & ~"],

	banlists: 'formathelp',
	tier: 'formathelp',
	tiers: 'formathelp',
	formats: 'formathelp',
	tiershelp: 'formathelp',
	formatshelp: 'formathelp',
	formathelp: function (target, room, user, connection, cmd) {
		if (!this.canBroadcast()) return;
		if (!target) {
			return this.sendReplyBox(
				"- <a href=\"https://www.smogon.com/tiers/\">Smogon Tiers</a><br />" +
				"- <a href=\"https://www.smogon.com/forums/threads/3498332/\">Tiering FAQ</a><br />" +
				"- <a href=\"https://www.smogon.com/xyhub/tiers\">The banlists for each tier</a><br />" +
				"<br /><em>Type /formatshelp <strong>[format|section]</strong> to get details about an available format or group of formats.</em>"
			);
		}
		var targetId = toId(target);
		if (targetId === 'ladder') targetId = 'search';
		if (targetId === 'all') targetId = '';

		var formatList;
		var format = Tools.getFormat(targetId);
		if (format.effectType === 'Format') formatList = [targetId];
		if (!formatList) {
			if (this.broadcasting && (cmd !== 'om' && cmd !== 'othermetas')) return this.sendReply("'" + target + "' is not a format. This command's search mode is too spammy to broadcast.");
			formatList = Object.keys(Tools.data.Formats).filter(function (formatid) {return Tools.data.Formats[formatid].effectType === 'Format';});
		}

		// Filter formats and group by section
		var exactMatch = '';
		var sections = {};
		var totalMatches = 0;
		for (var i = 0; i < formatList.length; i++) {
			var format = Tools.getFormat(formatList[i]);
			var sectionId = toId(format.section);
			if (targetId && !format[targetId + 'Show'] && sectionId !== targetId && format.id === formatList[i] && !format.id.startsWith(targetId)) continue;
			totalMatches++;
			if (!sections[sectionId]) sections[sectionId] = {name: format.section, formats: []};
			sections[sectionId].formats.push(format.id);
			if (format.id !== targetId) continue;
			exactMatch = sectionId;
			break;
		}

		if (!totalMatches) return this.sendReply("No " + (target ? "matched " : "") + "formats found.");
		if (totalMatches === 1) {
			var format = Tools.getFormat(Object.values(sections)[0].formats[0]);
			if (!format.desc) return this.sendReplyBox("No description found for this " + (format.gameType || "singles").capitalize() + " " + format.section + " format.");
			return this.sendReplyBox(format.desc.join("<br />"));
		}

		// Build tables
		var buf = [];
		for (var sectionId in sections) {
			if (exactMatch && sectionId !== exactMatch) continue;
			buf.push("<h3>" + Tools.escapeHTML(sections[sectionId].name) + "</h3>");
			buf.push("<table class=\"scrollable\" style=\"display:inline-block; max-height:200px; border:1px solid gray; border-collapse:collapse\" cellspacing=\"0\" cellpadding=\"5\"><thead><th style=\"border:1px solid gray\" >Name</th><th style=\"border:1px solid gray\" >Description</th></thead><tbody>");
			for (var i = 0; i < sections[sectionId].formats.length; i++) {
				var format = Tools.getFormat(sections[sectionId].formats[i]);
				var mod = format.mod && format.mod !== 'base' ? " - " + Tools.escapeHTML(format.mod === format.id ? format.name : format.mod).capitalize() : "";
				buf.push("<tr><td style=\"border:1px solid gray\">" + Tools.escapeHTML(format.name) + "</td><td style=\"border: 1px solid gray; margin-left:10px\">" + (format.desc ? format.desc.join("<br />") : "&mdash;") + "</td></tr>");
			}
			buf.push("</tbody></table>");
		}
		return this.sendReply("|raw|<center>" + buf.join("") + "</center>");
	},

	roomhelp: function (target, room, user) {
		if (room.id === 'lobby' || room.battle) return this.sendReply("This command is too spammy for lobby/battles.");
		if (!this.canBroadcast()) return;
		this.sendReplyBox(
			"Room drivers (%) can use:<br />" +
			"- /warn OR /k <em>username</em>: warn a user and show the Pok&eacute;mon Showdown rules<br />" +
			"- /mute OR /m <em>username</em>: 7 minute mute<br />" +
			"- /hourmute OR /hm <em>username</em>: 60 minute mute<br />" +
			"- /unmute <em>username</em>: unmute<br />" +
			"- /announce OR /wall <em>message</em>: make an announcement<br />" +
			"- /modlog <em>username</em>: search the moderator log of the room<br />" +
			"- /modnote <em>note</em>: adds a moderator note that can be read through modlog<br />" +
			"<br />" +
			"Room moderators (@) can also use:<br />" +
			"- /roomban OR /rb <em>username</em>: bans user from the room<br />" +
			"- /roomunban <em>username</em>: unbans user from the room<br />" +
			"- /roomvoice <em>username</em>: appoint a room voice<br />" +
			"- /roomdevoice <em>username</em>: remove a room voice<br />" +
			"- /modchat <em>[off/autoconfirmed/+]</em>: set modchat level<br />" +
			"<br />" +
			"Room owners (#) can also use:<br />" +
			"- /roomintro <em>intro</em>: sets the room introduction that will be displayed for all users joining the room<br />" +
			"- /rules <em>rules link</em>: set the room rules link seen when using /rules<br />" +
			"- /roommod, /roomdriver <em>username</em>: appoint a room moderator/driver<br />" +
			"- /roomdemod, /roomdedriver <em>username</em>: remove a room moderator/driver<br />" +
			"- /modchat <em>[%/@/#]</em>: set modchat level<br />" +
			"- /declare <em>message</em>: make a large blue declaration to the room<br />" +
			"- !htmlbox <em>HTML code</em>: broadcasts a box of HTML code to the room<br />" +
			"- !showimage <em>[url], [width], [height]</em>: shows an image to the room<br />" +
			"<br />" +
			"More detailed help can be found in the <a href=\"https://www.smogon.com/sim/roomauth_guide\">roomauth guide</a><br />" +
			"</div>"
		);
	},

	restarthelp: function (target, room, user) {
		if (room.id === 'lobby' && !this.can('lockdown')) return false;
		if (!this.canBroadcast()) return;
		this.sendReplyBox(
			"The server is restarting. Things to know:<br />" +
			"- We wait a few minutes before restarting so people can finish up their battles<br />" +
			"- The restart itself will take around 0.6 seconds<br />" +
			"- Your ladder ranking and teams will not change<br />" +
			"- We are restarting to update Pok&eacute;mon Showdown to a newer version"
		);
	},

	rule: 'rules',
	rules: function (target, room, user) {
		if (!target) {
			if (!this.canBroadcast()) return;
			this.sendReplyBox("Please follow the rules:<br />" +
				(room.rulesLink ? "- <a href=\"" + Tools.escapeHTML(room.rulesLink) + "\">" + Tools.escapeHTML(room.title) + " room rules</a><br />" : "") +
				"- <a href=\"https://pokemonshowdown.com/rules\">" + (room.rulesLink ? "Global rules" : "Rules") + "</a>");
			return;
		}
		if (!this.can('roommod', null, room)) return;
		if (target.length > 100) {
			return this.sendReply("Error: Room rules link is too long (must be under 100 characters). You can use a URL shortener to shorten the link.");
		}

		room.rulesLink = target.trim();
		this.sendReply("(The room rules link is now: " + target + ")");

		if (room.chatRoomData) {
			room.chatRoomData.rulesLink = room.rulesLink;
			Rooms.global.writeChatRoomData();
		}
	},

	faq: function (target, room, user) {
		if (!this.canBroadcast()) return;
		target = target.toLowerCase();
		var buffer = "";
		var matched = false;

		if (target === 'all' && this.broadcasting) {
			return this.sendReplyBox("You cannot broadcast all FAQs at once.");
		}

		if (!target || target === 'all') {
			matched = true;
			buffer += "<a href=\"https://www.smogon.com/sim/faq\">Frequently Asked Questions</a><br />";
		}
		if (target === 'all' || target === 'elo') {
			matched = true;
			buffer += "<a href=\"https://www.smogon.com/sim/faq#elo\">Why did this user gain or lose so many points?</a><br />";
		}
		if (target === 'all' || target === 'doubles' || target === 'triples' || target === 'rotation') {
			matched = true;
			buffer += "<a href=\"https://www.smogon.com/sim/faq#doubles\">Can I play doubles/triples/rotation battles here?</a><br />";
		}
		if (target === 'all' || target === 'restarts') {
			matched = true;
			buffer += "<a href=\"https://www.smogon.com/sim/faq#restarts\">Why is the server restarting?</a><br />";
		}
		if (target === 'all' || target === 'star' || target === 'player') {
			matched = true;
			buffer += '<a href="https://www.smogon.com/sim/faq#star">Why is there this star (&starf;) in front of my username?</a><br />';
		}
		if (target === 'all' || target === 'staff') {
			matched = true;
			buffer += "<a href=\"https://www.smogon.com/sim/staff_faq\">Staff FAQ</a><br />";
		}
		if (target === 'all' || target === 'autoconfirmed' || target === 'ac') {
			matched = true;
			buffer += "A user is autoconfirmed when they have won at least one rated battle and have been registered for a week or longer.<br />";
		}
		if (target === 'all' || target === 'customavatar' || target === 'ca') {
			matched = true;
			buffer += "<a href=\"https://www.smogon.com/sim/faq#customavatar\">How can I get a custom avatar?</a><br />";
		}
		if (target === 'all' || target === 'pm' || target === 'msg' || target === 'w') {
			matched = true;
			buffer += "<a href=\"https://www.smogon.com/sim/faq#pm\">How can I send a user a private message?</a><br />";
		}
		if (target === 'all' || target === 'challenge' || target === 'chall') {
			matched = true;
			buffer += "<a href=\"https://www.smogon.com/sim/faq#challenge\">How can I battle a specific user?</a><br />";
		}
		if (target === 'all'  || target === 'gxe') {
			matched = true;
			buffer += "<a href=\"https://www.smogon.com/sim/faq#gxe\">What does GXE mean?</a><br />";
		}
		if (target === 'all'  || target === 'coil') {
			matched = true;
			buffer += "<a href=\"http://www.smogon.com/forums/threads/coil-explained.3508013\">What is COIL?</a><br />";
		}
		if (!matched) {
			return this.sendReply("The FAQ entry '" + target + "' was not found. Try /faq for general help.");
		}
		this.sendReplyBox(buffer);
	},
	faqhelp: ["/faq [theme] - Provides a link to the FAQ. Add deviation, doubles, randomcap, restart, or staff for a link to these questions. Add all for all of them.",
		"!faq [theme] - Shows everyone a link to the FAQ. Add deviation, doubles, randomcap, restart, or staff for a link to these questions. Add all for all of them. Requires: + % @ # & ~"],

	analysis: 'smogdex',
	strategy: 'smogdex',
	smogdex: function (target, room, user) {
		if (!this.canBroadcast()) return;

		var targets = target.split(',');
		var pokemon = Tools.getTemplate(targets[0]);
		var item = Tools.getItem(targets[0]);
		var move = Tools.getMove(targets[0]);
		var ability = Tools.getAbility(targets[0]);
		var format = Tools.getFormat(targets[0]);
		var atLeastOne = false;
		var generation = (targets[1] || 'xy').trim().toLowerCase();
		var genNumber = 6;
		var extraFormat = Tools.getFormat(targets[2]);

		if (generation === 'xy' || generation === 'oras' || generation === '6' || generation === 'six') {
			generation = 'xy';
		} else if (generation === 'bw' || generation === 'bw2' || generation === '5' || generation === 'five') {
			generation = 'bw';
			genNumber = 5;
		} else if (generation === 'dp' || generation === 'dpp' || generation === '4' || generation === 'four') {
			generation = 'dp';
			genNumber = 4;
		} else if (generation === 'adv' || generation === 'rse' || generation === 'rs' || generation === '3' || generation === 'three') {
			generation = 'rs';
			genNumber = 3;
		} else if (generation === 'gsc' || generation === 'gs' || generation === '2' || generation === 'two') {
			generation = 'gs';
			genNumber = 2;
		} else if (generation === 'rby' || generation === 'rb' || generation === '1' || generation === 'one') {
			generation = 'rb';
			genNumber = 1;
		} else {
			generation = 'xy';
		}

		// Pokemon
		if (pokemon.exists) {
			atLeastOne = true;
			if (genNumber < pokemon.gen) {
				return this.sendReplyBox("" + pokemon.name + " did not exist in " + generation.toUpperCase() + "!");
			}
			// if (pokemon.tier === 'CAP') generation = 'cap';
			if (pokemon.tier === 'CAP') return this.sendReply("CAP is not currently supported by Smogon Strategic Pokedex.");

			var illegalStartNums = {'351':1, '421':1, '487':1, '555':1, '647':1, '648':1, '649':1, '681':1};
			if (pokemon.isMega || pokemon.num in illegalStartNums) pokemon = Tools.getTemplate(pokemon.baseSpecies);

			var formatName = extraFormat.name;
			var formatId = extraFormat.id;
			if (formatId === 'doublesou') {
				formatId = 'doubles';
			} else if (formatId.includes('vgc')) {
				formatId = 'vgc' + formatId.slice(-2);
				formatName = 'VGC20' + formatId.slice(-2);
			} else if (extraFormat.effectType !== 'Format') {
				formatName = formatId = '';
			}
			var speciesid = pokemon.speciesid;
			// Special case for Meowstic-M
			if (speciesid === 'meowstic') speciesid = 'meowsticm';
			this.sendReplyBox("<a href=\"https://www.smogon.com/dex/" + generation + "/pokemon/" + speciesid + (formatId ? '/' + formatId : '') + "\">" + generation.toUpperCase() + " " + Tools.escapeHTML(formatName) + " " + pokemon.name + " analysis</a>, brought to you by <a href=\"https://www.smogon.com\">Smogon University</a>");
		}

		// Item
		if (item.exists && genNumber > 1 && item.gen <= genNumber) {
			atLeastOne = true;
			this.sendReplyBox("<a href=\"https://www.smogon.com/dex/" + generation + "/items/" + item.id + "\">" + generation.toUpperCase() + " " + item.name + " item analysis</a>, brought to you by <a href=\"https://www.smogon.com\">Smogon University</a>");
		}

		// Ability
		if (ability.exists && genNumber > 2 && ability.gen <= genNumber) {
			atLeastOne = true;
			this.sendReplyBox("<a href=\"https://www.smogon.com/dex/" + generation + "/abilities/" + ability.id + "\">" + generation.toUpperCase() + " " + ability.name + " ability analysis</a>, brought to you by <a href=\"https://www.smogon.com\">Smogon University</a>");
		}

		// Move
		if (move.exists && move.gen <= genNumber) {
			atLeastOne = true;
			this.sendReplyBox("<a href=\"https://www.smogon.com/dex/" + generation + "/moves/" + toId(move.name) + "\">" + generation.toUpperCase() + " " + move.name + " move analysis</a>, brought to you by <a href=\"https://www.smogon.com\">Smogon University</a>");
		}

		// Format
		if (format.id) {
			var formatName = format.name;
			var formatId = format.id;
			if (formatId === 'doublesou') {
				formatId = 'doubles';
			} else if (formatId.includes('vgc')) {
				formatId = 'vgc' + formatId.slice(-2);
				formatName = 'VGC20' + formatId.slice(-2);
			} else if (format.effectType !== 'Format') {
				formatName = formatId = '';
			}
			if (formatName) {
				atLeastOne = true;
				this.sendReplyBox("<a href=\"https://www.smogon.com/dex/" + generation + "/formats/" + formatId + "\">" + generation.toUpperCase() + " " + Tools.escapeHTML(formatName) + " format analysis</a>, brought to you by <a href=\"https://www.smogon.com\">Smogon University</a>");
			}
		}

		if (!atLeastOne) {
			return this.sendReplyBox("Pok&eacute;mon, item, move, ability, or format not found for generation " + generation.toUpperCase() + ".");
		}
	},
	smogdexhelp: ["/analysis [pokemon], [generation] - Links to the Smogon University analysis for this Pok\u00e9mon in the given generation.",
		"!analysis [pokemon], [generation] - Shows everyone this link. Requires: + % @ # & ~"],

	veekun: function (target, broadcast, user) {
		if (!this.canBroadcast()) return;

		var baseLink = 'http://veekun.com/dex/';

		var pokemon = Tools.getTemplate(target);
		var item = Tools.getItem(target);
		var move = Tools.getMove(target);
		var ability = Tools.getAbility(target);
		var nature = Tools.getNature(target);
		var atLeastOne = false;

		// Pokemon
		if (pokemon.exists) {
			atLeastOne = true;
			if (pokemon.isNonstandard) return this.sendReply(pokemon.species + ' is not a real Pok\u00e9mon.');

			var baseSpecies = pokemon.baseSpecies || pokemon.species;
			var forme = pokemon.forme;

			// Showdown and Veekun have different naming for this gender difference forme of Meowstic.
			if (baseSpecies === 'Meowstic' && forme === 'F') {
				forme = 'Female';
			}

			var link = baseLink + 'pokemon/' + baseSpecies.toLowerCase();
			if (forme) {
				link += '?form=' + forme.toLowerCase();
			}

			this.sendReplyBox("<a href=\"" + link + "\">" + pokemon.species + " description</a> by Veekun");
		}

		// Item
		if (item.exists) {
			atLeastOne = true;
			var link = baseLink + 'items/' + item.name.toLowerCase();
			this.sendReplyBox("<a href=\"" + link + "\">" + item.name + " item description</a> by Veekun");
		}

		// Ability
		if (ability.exists) {
			atLeastOne = true;
			if (ability.isNonstandard) return this.sendReply(ability.name + ' is not a real ability.');
			var link = baseLink + 'abilities/' + ability.name.toLowerCase();
			this.sendReplyBox("<a href=\"" + link + "\">" + ability.name + " ability description</a> by Veekun");
		}

		// Move
		if (move.exists) {
			atLeastOne = true;
			if (move.isNonstandard) return this.sendReply(move.name + ' is not a real move.');
			var link = baseLink + 'moves/' + move.name.toLowerCase();
			this.sendReplyBox("<a href=\"" + link + "\">" + move.name + " move description</a> by Veekun");
		}

		// Nature
		if (nature.exists) {
			atLeastOne = true;
			var link = baseLink + 'natures/' + nature.name.toLowerCase();
			this.sendReplyBox("<a href=\"" + link + "\">" + nature.name + " nature description</a> by Veekun");
		}

		if (!atLeastOne) {
			return this.sendReplyBox("Pok&eacute;mon, item, move, ability, or nature not found.");
		}
	},
	veekunhelp: ["/veekun [pokemon] - Links to Veekun website for this pokemon/item/move/ability/nature.",
		"!veekun [pokemon] - Shows everyone this link. Requires: + % @ # & ~"],

	register: function () {
		if (!this.canBroadcast()) return;
		this.sendReplyBox('You will be prompted to register upon winning a rated battle. Alternatively, there is a register button in the <button name="openOptions"><i class="icon-cog"></i> Options</button> menu in the upper right.');
	},

	/*********************************************************
	 * Miscellaneous commands
	 *********************************************************/

	potd: function (target, room, user) {
		if (!this.can('potd')) return false;

		Config.potd = target;
		Simulator.SimulatorProcess.eval('Config.potd = \'' + toId(target) + '\'');
		if (target) {
			if (Rooms.lobby) Rooms.lobby.addRaw("<div class=\"broadcast-blue\"><b>The Pok&eacute;mon of the Day is now " + target + "!</b><br />This Pokemon will be guaranteed to show up in random battles.</div>");
			this.logModCommand("The Pok\u00e9mon of the Day was changed to " + target + " by " + user.name + ".");
		} else {
			if (Rooms.lobby) Rooms.lobby.addRaw("<div class=\"broadcast-blue\"><b>The Pok&eacute;mon of the Day was removed!</b><br />No pokemon will be guaranteed in random battles.</div>");
			this.logModCommand("The Pok\u00e9mon of the Day was removed by " + user.name + ".");
		}
	},

	roll: 'dice',
	dice: function (target, room, user) {
		if (!target || target.match(/[^d\d\s\-\+HL]/i)) return this.parse('/help dice');
		if (!this.canBroadcast()) return;

		// ~30 is widely regarded as the sample size required for sum to be a Gaussian distribution.
		// This also sets a computation time constraint for safety.
		var maxDice = 40;

		var diceQuantity = 1;
		var diceDataStart = target.indexOf('d');
		if (diceDataStart >= 0) {
			if (diceDataStart) diceQuantity = Number(target.slice(0, diceDataStart));
			target = target.slice(diceDataStart + 1);
			if (!Number.isInteger(diceQuantity) || diceQuantity <= 0 || diceQuantity > maxDice) return this.sendReply("The amount of dice rolled should be a natural number up to " + maxDice + ".");
		}
		var offset = 0;
		var removeOutlier = 0;

		var modifierData = target.match(/[\-\+]/);
		if (modifierData) {
			switch (target.slice(modifierData.index).trim().toLowerCase()) {
			case '-l':
				removeOutlier = -1;
				break;
			case '-h':
				removeOutlier = +1;
				break;
			default:
				offset = Number(target.slice(modifierData.index));
				if (isNaN(offset)) return this.parse('/help dice');
				if (!Number.isSafeInteger(offset)) return this.sendReply("The specified offset must be an integer up to " + Number.MAX_SAFE_INTEGER + ".");
			}
			if (removeOutlier && diceQuantity <= 1) return this.sendReply("More than one dice should be rolled before removing outliers.");
			target = target.slice(0, modifierData.index);
		}

		var diceFaces = 6;
		if (target.length) {
			diceFaces = Number(target);
			if (!Number.isSafeInteger(diceFaces) || diceFaces <= 0) {
				return this.sendReply("Rolled dice must have a natural amount of faces up to " + Number.MAX_SAFE_INTEGER + ".");
			}
		}

		if (diceQuantity > 1) {
			// Make sure that we can deal with high rolls
			if (!Number.isSafeInteger(offset < 0 ? diceQuantity * diceFaces : diceQuantity * diceFaces + offset)) {
				return this.sendReply("The maximum sum of rolled dice must be lower or equal than " + Number.MAX_SAFE_INTEGER + ".");
			}
		}

		var maxRoll = 0;
		var minRoll = Number.MAX_SAFE_INTEGER;

		var trackRolls = diceQuantity * (('' + diceFaces).length + 1) <= 60;
		var rolls = [];
		var rollSum = 0;

		for (var i = 0; i < diceQuantity; ++i) {
			var curRoll = Math.floor(Math.random() * diceFaces) + 1;
			rollSum += curRoll;
			if (curRoll > maxRoll) maxRoll = curRoll;
			if (curRoll < minRoll) minRoll = curRoll;
			if (trackRolls) rolls.push(curRoll);
		}

		// Apply modifiers

		if (removeOutlier > 0) {
			rollSum -= maxRoll;
		} else if (removeOutlier < 0) {
			rollSum -= minRoll;
		}
		if (offset) rollSum += offset;

		// Reply with relevant information

		var offsetFragment = "";
		if (offset) offsetFragment += (offset > 0 ? "+" + offset : offset);

		if (diceQuantity === 1) return this.sendReplyBox("Roll (1 - " + diceFaces + ")" + offsetFragment + ": " + rollSum);

		var sumFragment = "<br />Sum" + offsetFragment + (removeOutlier ? " except " + (removeOutlier > 0 ? "highest" : "lowest") : "");
		return this.sendReplyBox("" + diceQuantity + " rolls (1 - " + diceFaces + ")" + (trackRolls ? ": " + rolls.join(", ") : "") + sumFragment + ": " + rollSum);
	},
	dicehelp: ["/dice [max number] - Randomly picks a number between 1 and the number you choose.",
		"/dice [number of dice]d[number of sides] - Simulates rolling a number of dice, e.g., /dice 2d4 simulates rolling two 4-sided dice.",
		"/dice [number of dice]d[number of sides][+/-][offset] - Simulates rolling a number of dice and adding an offset to the sum, e.g., /dice 2d6+10: two standard dice are rolled; the result lies between 12 and 22.",
		"/dice [number of dice]d[number of sides]-[H/L] - Simulates rolling a number of dice with removal of extreme values, e.g., /dice 3d8-L: rolls three 8-sided dice; the result ignores the lowest value."],

	pr: 'pickrandom',
	pick: 'pickrandom',
	pickrandom: function (target, room, user) {
		var options = target.split(',');
		if (options.length < 2) return this.parse('/help pick');
		if (!this.canBroadcast()) return false;
		return this.sendReplyBox('<em>We randomly picked:</em> ' + Tools.escapeHTML(options.sample().trim()));
	},
	pickrandomhelp: ["/pick [option], [option], ... - Randomly selects an item from a list containing 2 or more elements."],

	showimage: function (target, room, user) {
		if (!target) return this.parse('/help showimage');
		if (!this.can('declare', null, room)) return false;
		if (!this.canBroadcast()) return;

		var targets = target.split(',');
		if (targets.length !== 3) {
			return this.parse('/help showimage');
		}

		this.sendReply('|raw|<img src="' + Tools.escapeHTML(targets[0]) + '" alt="" width="' + toId(targets[1]) + '" height="' + toId(targets[2]) + '" />');
	},
	showimagehelp: ["/showimage [url], [width], [height] - Show an image. Requires: # & ~"],

	htmlbox: function (target, room, user, connection, cmd, message) {
		if (!target) return this.parse('/help htmlbox');
		if (!this.canHTML(target)) return;

		if (user.userid === 'github') {
			if (!this.can('announce', null, room)) return;
			if (message.charAt(0) === '!') this.broadcasting = true;
		} else {
			if (!this.can('declare', null, room)) return;
			if (!this.canBroadcast('!htmlbox')) return;
		}

		this.sendReplyBox(target);
	},
	htmlboxhelp: ["/htmlbox [message] - Displays a message, parsing HTML code contained. Requires: ~ # with global authority"],

	urand: 'ud',
	udrand: 'ud',
	u: 'ud',
	ud: function(target, room, user, connection, cmd) {
		var random = false;
		if (!target) {
			target = '';
			random = true;
		}
		if (target.toString().length > 50) return this.sendReply('/ud - <phrase> can not be longer than 50 characters.');
		if (!this.canBroadcast()) return;

		var options;
		if (!random) {
			options = {
			    host: 'api.urbandictionary.com',
			    port: 80,
			    path: '/v0/define?term=' + encodeURIComponent(target)
			};
		} else {
			options = {
			    host: 'api.urbandictionary.com',
			    port: 80,
			    path: '/v0/random',
			};
		}

		var milliseconds = ((44640 * 60) * 1000);

		if (urbanCache[target.toLowerCase().replace(/ /g, '')] && Math.round(Math.abs((urbanCache[target.toLowerCase().replace(/ /g, '')].time - Date.now())/(24*60*60*1000))) < 31) {
			return this.sendReplyBox("<b>" + Tools.escapeHTML(target) + ":</b> " + urbanCache[target.toLowerCase().replace(/ /g, '')].definition.substr(0,400));
		}

		var self = this;

		var req = http.get(options, function(res) {
			res.setEncoding('utf8');
			if (res.statusCode !== 200) {
				self.sendReplyBox('No results for <b>"' + Tools.escapeHTML(target) + '"</b>.');
				return room.update();
			}
			var data = '';

			res.on('data', function (chunk) {
				console.log('BODY: ' + chunk);
				data += chunk;
			});

			res.on('end', function () {
				var page = JSON.parse(data);
				if (page['result_type'] === 'no_results') {
		        	self.sendReplyBox('No results for <b>"' + Tools.escapeHTML(target) + '"</b>.');
		        	return room.update();
		        }

				var definitions = page['list'];
				var output = '<b>' + Tools.escapeHTML(definitions[0]['word']) + ':</b> ' + Tools.escapeHTML(definitions[0]['definition']).replace(/\r\n/g, '<br />').replace(/\n/g, ' ');
				if (output.length > 400) output = output.slice(0,400) + '...';
				cacheUrbanWord(definitions[0]['word'], Tools.escapeHTML(definitions[0]['definition']).replace(/\r\n/g, '<br />').replace(/\n/g, ' '));
				self.sendReplyBox(output);
				return room.update();
			});
		});

		req.on('error', function(e) {
			console.log('/u error: ' + e.message);
		});
		req.end();
	},
};

process.nextTick(function () {
	// This slow operation is done *after* we start listening for connections
	// to the server. Anybody who connects while data is loading will
	// have to wait a couple seconds before they are able to join the server, but
	// at least they probably won't receive a connection error message.

	Tools.includeData();
});
