/**
 * Commands Plugin for Unibot
 * @param  {Object} options [description]
 *   db: {mongoose} the mongodb connection
 *   bot: {irc} the irc bot
 *   web: {connect} a connect + connect-rest webserver
 *   config: {object}
 * @return {Function}         init function to access shared resources
 */
module.exports = function init(options){

  var mongoose = options.db;
  var bot = options.bot;
  var webserver = options.web;
  var config = options.config;

  /**
   * Creating a mongoose schema for a channel command collection record (1 record per channel)
   * {
   *   channel: '123-abc',
   *   commands: {
   *     'help': 'Let me help you!',
   *     'hello': 'Hi there'
   *   }
   * }
   * 
   */
  var Commands = new mongoose.Schema({
    channel : {
      type  : String, // channel._id
      index : {
        unique   : true,
        dropDups : false
      }
    },
    commands : {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  });
  var model = mongoose.model('Commands', Commands);

  webserver.get('/commands', function(req, res, next){
    res.sendFile('./index.html');
  });

  webserver.get('/commands/:channel', function(req, res, next) {
    model.findOne({ channel: req.params.channel }, function(err, commands){
      res.send(err || commands);
    });
  });

  // lowercase and escapes characters that are invalid JSON keys
  function cleanCommand(input) {
    var out = input;
    return out.replace(/\$/g, String.fromCharCode(0xFF04)).replace(/\./g, '．').toLowerCase();
  }

  return function plugin(channel){

    // Retrieve or create a new mongo record for this channel and store it to `commands`
    var commands;
    model.findOne({ channel: channel.id }, function(err, _commands_){
      if (err || !_commands_) {
        commands = new model({
          channel: channel.id
        });
        commands.save();
      } else {
        commands = _commands_;
      }
    });

    return {
      // Execute Command
      // [nick:] !command [tokens]
      "(?:(\\S+): )?(?:!(\\S+))(?: (.+))?": function(from, matches) {
        if (!commands) return; // mongoose hasn't retrieved channel record yet
        
        matches[2] = cleanCommand(matches[2]);

        if (!commands.commands[matches[2]]) return;
        if (matches[1]) from = matches[1];
        var message = commands.commands[matches[2]];
        var tokens = matches[3] || '';
        tokens = tokens.split(' ');
        message = message.split(':tokens').join(tokens.join('+'));
        var l = tokens.length;
        while (l--) {
          message = message.split( ':token'+ (l + 1) ).join(tokens[l]);
        }
        message
        message = message.split(':nick').join(from);
        channel.say(message);
      },
      // Save Command
      // !remember [command] is [Hello :nick, this is the output :tokens]
      "^!remember (\\S+) is (.+)": function(from, matches) {
        if (!commands) return; // mongoose hasn't retrieved channel record yet
        
        matches[1] = cleanCommand(matches[1]);

        commands.commands[matches[1]] = matches[2];
        commands.markModified('commands');
        commands.save(function(err){
          if (err) {
            channel.say('Error saving "'+matches[1]+'": '+err, from);
            if (config.owner)
              channel.say('Please notify '+config.owner, from);
          } else {
            channel.say('Command "'+matches[1]+'" saved!', from);
          }
        });
      },
      // Delete Command
      "^!forget (\\S+)": function(from, matches) {
        if (!commands) return; // mongoose hasn't retrieved channel record yet
        
        matches[1] = cleanCommand(matches[1]);
        if (!commands.commands[matches[1]]) return channel.say('Command Not Found: '+matches[1], from);
        delete commands.commands[matches[1]];
        commands.markModified('commands');
        commands.save(function(err){
          if (err) {
            channel.say('Error removing "'+matches[1]+'": '+err, from);
            if (config.owner)
              channel.say('Please notify '+config.owner, from);
          } else {
            channel.say('Command "'+matches[1]+'" forgotten!', from);
          }
        });
      },
      // Show Raw Command
      "^!show (\\S+)": function(from, matches) {
        if (!commands) return; // mongoose hasn't retrieved channel record yet
        
        matches[1] = cleanCommand(matches[1]);
        if (!commands.commands[matches[1]]) return channel.say('Command Not Found: '+matches[1], from);
        channel.say(commands.commands[matches[1]], from);
      }
    };
  };
};