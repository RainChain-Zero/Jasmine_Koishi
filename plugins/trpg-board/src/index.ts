import { Context, Schema, segment, sleep, Time } from 'koishi'
import '@koishijs/plugin-adapter-onebot'
import * as fs from 'fs-extra';

export const name = 'trpg-board'

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

//数据路径
const path = './plugins/trpg-board/src/data.json'
const idPath = './plugins/trpg-board/src/id.txt'

//八个方舟群
//const arkGroups: Array<string> = ['1007561501', '1025316358', '925777201', '933402821', '1169975517', '660324090', '152791149', '636500288']
//const arkGroups: Array<string> = ['436159372']
const arkGroups: Array<string> = ['1007561501']
//测试群.
const testGroups: Array<string> = ['436159372']

//格式不符合检测
function checkTrpg(info: string): boolean {
  const checkKey: Array<string> = ['模组', '规则书', '主持人', '人数', '推荐技能', '开团时间', '背景']
  for (let index in checkKey) {
    if (!info.includes(checkKey[index])) {
      return false
    }
  }
  return true
}

interface trpgType {
  id: number,
  qq: string,
  state: string
}

function getTrpg(id: number, array: Array<trpgType>): number {
  for (var i = 0; i < array.length; ++i) {
    if (array[i].id === id) {
      return i
    }
  }
  return i
}

export function apply(ctx: Context) {
  ctx.guild(...arkGroups)
    .command('开舟团')
    .action(async ({ session }) => {
      await session.send(segment('quote', { id: session.messageId }) + `请将开团信息发送上来哦~你的下一条消息将作为公告在${arkGroups.length}个群广播\n可以输入"取消"以停止。`)
      let info = await session.prompt(Time.minute)
      if (!info || info === '取消') {
        await session.send(segment('quote', { id: session.messageId }) + '还没有想好吗？没有关系，之后再来也可以哦~')
        return
      }
      //长度不可以超过公告长度
      if (info.length > 594) {
        await session.send(`请适当缩减长度，当前字数${info.length}/594`)
        return
      }
      if (!checkTrpg(info)) {
        await session.send('格式不合规范，请阅读群公告')
        return
      }

      const dataRaw: string = fs.readFileSync(path, 'utf8')
      let data: Array<trpgType> = JSON.parse(dataRaw)
      const idNow: number = parseInt(fs.readFileSync(idPath, 'utf8'))
      fs.writeFileSync(idPath, (idNow + 1).toString())
      data.push({ id: idNow, qq: session.uid, state: '正在招人中...' })
      fs.writeFileSync(path, JSON.stringify(data))

      info = `ID：${idNow}\n${info}`
      await session.send(`正在向${arkGroups.length}个群广播中...您的团编号为${idNow}`)
      //打乱群数组，公平性
      const arkGroupsShuffle = ((arr: Array<String>) => {
        //改变引用，防止修改到原数组
        arr = [...arr]
        var random: number
        var newArr = []

        while (arr.length) {
          random = Math.floor(Math.random() * arr.length)
          newArr.push(arr[random])
          arr.splice(random, 1)
        }
        return newArr
      })(arkGroups)
      for (let index = 0; index < arkGroupsShuffle.length; index++) {
        setTimeout(async () => {
          await session.onebot.sendGroupNoticeAsync(parseInt(arkGroupsShuffle[index]), info)
        }, (index + 1) * 5000)
      }
    })

  //查看或设置团状态
  ctx.guild(...arkGroups).command('团状态 <id:posint> [state:text]')
    .action(({ args, session }) => {
      const dataRaw: string = fs.readFileSync(path, 'utf8')
      let data: Array<trpgType> = JSON.parse(dataRaw)
      const index = getTrpg(args[0], data)
      //没有找到相应id
      if (index === data.length) {
        session.send('没有找到对应id的团，可能主持人已将其删除')
        return
      }
      //是否存在state参数
      if (args.length === 1) {
        session.send(`编号${args[0]}的当前团状态为：\n${data[index].state}`)
        return
      }
      //是否是主持人
      if (data[index].qq !== session.uid) {
        session.send('你没有权限修改此团状态，仅有开团人才可修改哦？')
        return
      }
      data[index].state = args[1]
      fs.writeFileSync(path, JSON.stringify(data))
      session.send('已为您修改了该团状态√')
    })

  //删除团
  ctx.guild(...arkGroups).command('删除团 <id:posint>')
    .action(({ args, session }) => {
      const dataRaw: string = fs.readFileSync(path, 'utf8')
      let data: Array<trpgType> = JSON.parse(dataRaw)
      const index = getTrpg(args[0], data)
      //没有找到相应id
      if (index === data.length) {
        session.send('没有找到对应id的团，可能主持人已将其删除')
        return
      }
      //是否是主持人
      if (data[index].qq !== session.uid) {
        session.send('你没有权限修改此团状态，仅有开团人才可修改哦？')
        return
      }
      data.splice(index, 1)
      fs.writeFileSync(path, JSON.stringify(data))
      session.send(`已为您删除编号${args[0]}的团`)
    })

  //监听入群事件
  ctx.guild(...arkGroups)
    .on('guild-member-request', (session) => {
      const content = session.content
      const answer = content.substring(content.lastIndexOf('答案：') + 3).toLowerCase().replace(/\s+/g, '')
      if (answer.includes('arkdice') || answer.includes('泰拉骰子') || answer.includes('骰子社') || answer.includes('忘忧')) {
        session.bot.internal.setGroupAddRequest(session.messageId, session.subtype, true)
      }
    })
}
