const { spawn } = require('child_process');
const { callbackify } = require('util');

var app = require('http').createServer(handler),
io = require('socket.io')(app),
ws = require("ws"),
fs = require("fs"),
url = require("url")
port = process.env.PORT || 8888,
queue = {
	'W' : [],
	'B' : [],
	'U' : [] //undefined (player does not care which color)
};


app.listen(port);
console.log("HTTP server listening on port " + port);


function handler(req, resp){
	var r_url = url.parse(req.url);
	if(r_url.pathname.substring(0) === "getport"){
		resp.writeHead(200, {"Content-Type" : "text/plain"});
		resp.write("" + port);
		resp.end();
	}
	else if(r_url.pathname.substring(0) === "/")
	{
		resp.writeHead(200, {"Content-Type" : "text/html"});
		console.log("Chess.html loading")
		var clientui = fs.readFileSync("chess.html");
		resp.write(clientui);
		resp.end();
	}
	else{
		var filename = r_url.pathname.substring(1),
		type;

		switch(filename.substring(filename.lastIndexOf(".") + 1)){
			case "html":
			case "htm":
			type = "text/html; charset=UTF-8";
			break;
			case "js":
			type = "application/javascript; charset=UTF-8";
			break;
			case "css":
			type = "text/css; charset=UTF-8";
			break;
			case "svg":
			type = "image/svg+xml";
			break;
			case "png":
			type= "image/png";
			break;
			default:
			type = "application/octet-stream";
			break;
		}

		fs.readFile(filename, function(err, content){
			if(err){
				resp.writeHead(404, {
					"Content-Type" : "text/plain; charset=UTF-8"
				});
				resp.write(err.message);
				resp.end();
			}
			else{
				resp.writeHead(200, {
					"Content-Type" : type
				});
				resp.write(content);
				resp.end();
			}
		});
	}
}

/* websocket server 
   all sent with JSON encoding
   */
/**
@class GameList singleton which defines the gamelist linked list
**/
var GameList = (function(){
	/**
	@class Node defines a linked list node
	@param obj the object the node contains
	@param next the next node
	**/
	var Node = function(obj, next){
		this.obj = obj;
		this.next = next;
	};
	var that = {},
		rear = null,//circular linked list, this is a pointer to the last node
		size = 0,//size of linked list
		unique = 0; //functions as game id

	/**
	Adds a game to the game list circular linked list
	@method addGame
	@param {Object} player the player player's socket
	@param {Object} bot the bot player's socket
	**/
	that.addGame = function(player, color, diff){
		if(rear == null){
			rear = new Node(new Game(player, color, diff, unique), null);
			rear.next = rear;
		}
		else{
			var newNode = new Node(new Game(player, color, diff, unique), rear.next);
			rear.next = newNode;
			rear = newNode;
		}
		size++;
		unique++;
		that.showGames();
	}

	that.removeGame = function(gid){
		console.log("Removing game" + gid);
		if(rear == null){
			console.log("Problem -- removing game from null list");
			return;	
		}
		/* 
			linear search, not digging this, perhaps later if this ever gets popular (not very likely) use an AVL tree or hash table
		*/
		var ptr = rear.next, prev = rear;
		if(ptr == null) return;

		do{
			if(ptr.obj.gid == gid){
				//remove this guy
				console.log("Removing game " + gid);
				if(ptr.next == ptr){
					//linked list of one node
					rear = null;
				}
				else{
					prev.next = ptr.next;
					ptr.next = null;
					if(ptr == rear){
						rear = prev;
					}
				}
				size--;
				that.showGames();
				return;
			}
			prev = ptr;
			ptr = ptr.next;
		}while(ptr != rear.next);
	};
/* for debugging */
	that.showGames = function(){
		if(rear == null){
			console.log("List empty");
			return;
		}
		var ptr = rear.next;
		var str = "Game List:\n";
		do{
			str += ptr.obj.gid + " ";
			ptr = ptr.next;
		}while(ptr != rear.next)
		console.log(str);
	}
	return that;
}());

var Game = function(player, color, diff, gid){

	var that = this,//reference in event functions
		disconnected = false;

	that.player = player;
	that.color = color;
	that.gid = gid;
	that.waitingForPromotion = false;
	that.diff = diff;
	that.spawn = require('child_process').spawn;

	console.log("Game started");

	that.calculateMove = function(data, callback){
		that.pythonBot = spawn('python', ['./scripts/main.py', data])
		that.pythonBot.stdout.on('data', function(data){
			move = `${data}`
			console.log(move)
			callback(move)
		})
		that.pythonBot.stderr.on('data', (data) => {
			console.error(`stderr: ${data}`);
		  });
		  
		that.pythonBot.on('close', (code) => {
			console.log(`child process exited with code ${code}`);
		  }); 
	};

	//remove the listener which removes it from the queue (since it no longer is on the queue)
	if (that.color == 'B'){
		data = 0;
		i = 0;
		that.calculateMove(null, function(move){
			data = move
			that.player.emit('opposing_move', data)
			console.log('Bot move: '+data)
		})
	}
	
	
	
	that.player.on('movemade', function(data){
		console.log("Player made a move");
		if(!disconnected){
			that.bot.calculateMove(data, function(move){
				console.log('Move Received!')
				data = move
				that.player.emit('opposing_move', data);
			});
		}
	});

	that.destroy = function(){
		disconnected = true;
		if(that.player == null && that.bot == null){
			GameList.removeGame(that.gid);
		}
	}
	//all event listeners to w and b sockets for communication
	that.init();

	return that;
};
Game.prototype = {
	player : null,
	bPlayer : null,
	init: function(){
		//send messages to player and bPlayer that game has started, and give them the color assigned (since they may not know the color)
		this.player.emit("matchfound", {
			color: this.color
		});
	}
}



//may need to add some securing to prevent thread accidents in the following method later
io.sockets.on('connection', function (sk) {
	var w = null,
	b = null,
	skColor = false;
	console.log("web socket connection recieved");


	sk.on('setup', function (data) {
  	 //remove this event once match is found and setup is complete  
  		sk.on('disconnect', function(){
  	 		if(!!queue[skColor]){
  	 			var index = queue[skColor].indexOf(sk);
  	 			console.log("Removing player from queue");
  	 			queue[skColor].splice(index,1);
  	 		}
  		});
  		console.log(data);
		console.log(queue)
  		skColor = data.color
		diff = 3;
	   
  		if(!skColor){skColor = 'U';}
  		if((skColor == 'W') || (skColor == 'B')){
			GameList.addGame(sk, skColor, diff)
  		}
  		else{ 
			let a = Math.random()
			if (a > 0.5) {
				GameList.addGame(sk, 'W', diff)
			}else{
				GameList.addGame(sk, 'B', diff)
			}
  		}

  	});
});

/** 
var Bot = function(diff){
	var that = this
    that.diff = diff
	var spawn = require('child_process').spawn;
	var pythonBot = spawn('python', ['./test.py'])

    that.calculateMove = function(data, callback){
		console.log("Calc move")
		pythonBot = spawn('python', ['./test.py', data])
		pythonBot.stdout.on('data', function(data){
			move = `${data}`
			console.log(move)
			callback(move)
		})
		pythonBot.stderr.on('data', (data) => {
			console.error(`stderr: ${data}`);
		  });
		  
		pythonBot.on('close', (code) => {
			console.log(`child process exited with code ${code}`);
		  }); 
	}  
}
*/

