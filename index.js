const config = require('./config').config();
const TeleBot = require('telebot');
const bot = new TeleBot(config.botToken);
const { spawn } = require('child_process');
const adminUsers = config.adminUsers;


const { db } = require('./db');
const { validate_fid, gen_count_body, count } = require('./src/gd');
const { send_count, send_help, send_choice, send_task_info, sm, extract_fid, extract_from_text, reply_cb_query, tg_copy, send_all_tasks } = require('./src/tg');
const { AUTH, ROUTER_PASSKEY, TG_IPLIST } = require('./config')
const { tg_whitelist } = AUTH

const counting = {}
//module.exports = { send_count, send_help, sm, extract_fid, reply_cb_query, send_choice, send_task_info, send_all_tasks, tg_copy, extract_from_text }

bot.on('text', (msg) => {

    const chat_id = msg && msg.chat && msg.chat.id
    // console.log(msg);
    // console.log('chat_id:   '+ chat_id);
    const id = msg.from.id;
    if(adminUsers.indexOf(id) < 0){
        msg.reply.text('You are not admin!');
        return;
    }

    // let prex = String(msg.text).substring(0,1);
    // console.log(prex);
    let words = String(msg.text).split(" ");
    let len = words.length;
    let args = [];
    if (len > 1 ){
        args = words.slice(1, len);

    }

    // console.log('reply:'+msg.text);
    // console.log('args:'+args);
    let is_shell = false


	  const text = msg && msg.text && msg.text.trim()
	  let username = msg && msg.from && msg.from.username
	  msgs = username && String(username).toLowerCase()
	  let user_id = msgs && msgs.from && msgs.from.id
	  user_id = user_id && String(user_id).toLowerCase()
	  if (!chat_id || !text || !tg_whitelist.some(v => {
	    v = String(v).toLowerCase()
	    return v === username || v === user_id
	  })) return console.warn('异常请求')

	    const fid = extract_fid(text) || extract_from_text(text)
	    const no_fid_commands = ['/task', '/help', '/bm']
	    if (!no_fid_commands.some(cmd => text.startsWith(cmd)) && !validate_fid(fid)) {
	      // console.log("is_shell:"+is_shell);
	      sm({ chat_id, text: '未识别出分享ID' })
	      is_shell = true
	    }
	    if (text.startsWith('/help')) return send_help(chat_id)
	    if (text.startsWith('/bm')) {
	      const [cmd, action, alias, target] = text.split(' ').map(v => v.trim())
	      if (!action) return send_all_bookmarks(chat_id)
	      if (action === 'set') {
	        if (!alias || !target) return sm({ chat_id, text: '别名和目标ID不能为空' })
	        if (alias.length > 24) return sm({ chat_id, text: '别名不要超过24个英文字符长度' })
	        if (!validate_fid(target)) return sm({ chat_id, text: '目标ID格式有误' })
	        set_bookmark({ chat_id, alias, target })
	      } else if (action === 'unset') {
	        if (!alias) return sm({ chat_id, text: '别名不能为空' })
	        unset_bookmark({ chat_id, alias })
	      } else {
	        send_bm_help(chat_id)
	      }
	    } else if (text.startsWith('/count')) {
	      if (counting[fid]) return sm({ chat_id, text: fid + ' 正在统计，请稍等片刻' })
	      try {
	        counting[fid] = true
	        const update = text.endsWith(' -u')
	        send_count({ fid, chat_id, update })
	      } catch (err) {
	        console.error(err)
	        sm({ chat_id, text: fid + ' 统计失败：' + err.message })
	      } finally {
	        delete counting[fid]
	      }
	    } else if (text.startsWith('/copy')) {
	      let target = text.replace('/copy', '').replace(' -u', '').trim().split(' ').map(v => v.trim())[1]
	      target = get_target_by_alias(target) || target
	      if (target && !validate_fid(target)) return sm({ chat_id, text: `目标ID ${target} 格式不正确` })
	      const update = text.endsWith(' -u')
	      tg_copy({ fid, target, chat_id, update }).then(task_id => {
	        task_id && sm({ chat_id, text: `开始复制，任务ID: ${task_id} 可输入 /task ${task_id} 查询进度` })
	      })
	    } else if (text.startsWith('/task')) {
	      let task_id = text.replace('/task', '').trim()
	      if (task_id === 'all') {
	        return send_all_tasks(chat_id)
	      } else if (task_id === 'clear') {
	        return clear_tasks(chat_id)
	      } else if (task_id === '-h') {
	        return send_task_help(chat_id)
	      } else if (task_id.startsWith('rm')) {
	        task_id = task_id.replace('rm', '')
	        task_id = parseInt(task_id)
	        if (!task_id) return send_task_help(chat_id)
	        return rm_task({ task_id, chat_id })
	      }
	      task_id = parseInt(task_id)
	      if (!task_id) {
	        const running_tasks = db.prepare('select id from task where status=?').all('copying')
	        if (!running_tasks.length) return sm({ chat_id, text: '当前暂无运行中的任务' })
	        return running_tasks.forEach(v => send_task_info({ chat_id, task_id: v.id }).catch(console.error))
	      }
	      send_task_info({ task_id, chat_id }).catch(console.error)
	    } else if (text.includes('drive.google.com/') || validate_fid(text)) {
	    	//return send_choice({ fid: fid || text, chat_id }).catch(console.error)
	    	let replyMarkup = bot.inlineKeyboard([
	        [
	            bot.inlineButton('文件统计', {callback: `count ${fid}` }),
	            bot.inlineButton('开始复制', {callback: `copy ${fid}` })
	        ]
	    	]);
	    	return bot.sendMessage(id, `识别出分享ID ${fid}，请选择动作`, {replyMarkup});
	    } else {
	    	is_shell = true
	    	// sm({ chat_id, text: '暫不支持此命令' })
	  	}

    if (is_shell) {
        console.log('run shell')
        msg.reply.text('$:   '+msg.text);
        const shell = spawn(words[0],args).on('error', function( err ){
        	msg.reply.text('error while executing:'+words[0]);
        	msg.reply.text(err);
    	});
    
        if(shell){

    	   shell.stdout.on('data', (data) => {
          	msg.reply.text(`stdout:\n ${data}`);
    	   });

    	   shell.stderr.on('data', (data) => {
        	msg.reply.text(`stderr: ${data}`);
    	   });

    	   shell.on('close', (code) => {
        	msg.reply.text(`shell exited with code ${code}`);
    	   });
	}
    }
});


// Inline button callback
bot.on('callbackQuery', msg => {
    // User message alert
    if (msg) {
    const { id, data } = msg
    const chat_id = msg.from.id
    // console.log("id:"+id);
    // console.log("chat_id:"+chat_id);
    // console.log("data:"+data);
    let [action, fid] = String(data).split(' ')
    // console.log("action:"+action);console.log("fid:"+fid);
    if (action === 'count') {
      if (counting[fid]) return sm({ chat_id, text: fid + ' 正在统计，请稍等片刻' })
      counting[fid] = true
      send_count({ fid, chat_id }).catch(err => {
        console.error(err)
        sm({ chat_id, text: fid + ' 统计失败：' + err.message })
      }).finally(() => {
        delete counting[fid]
      })
    } else if (action === 'copy') {
      if (COPYING_FIDS[fid]) return sm({ chat_id, text: `正在处理 ${fid} 的复制命令` })
      COPYING_FIDS[fid] = true
      tg_copy({ fid, target: get_target_by_alias(target), chat_id }).then(task_id => {
        task_id && sm({ chat_id, text: `开始复制，任务ID: ${task_id} 可输入 /task ${task_id} 查询进度` })
      }).finally(() => COPYING_FIDS[fid] = false)
    }
    return reply_cb_query({ id, data }).catch(console.error)

  }

    return bot.answerCallbackQuery(msg.id, `Inline button callback: ${ msg.data }`, true);
});



bot.start();



