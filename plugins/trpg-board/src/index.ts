import { Context, Schema, segment, sleep, Time } from 'koishi'

export const name = 'trpg-board'

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

//四个方舟群
const arkGroups: Array<number> = [1007561501, 1025316358, 925777201, 933402821]

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

export function apply(ctx: Context) {
  ctx.guild('1007561501', '1025316358', '925777201', '933402821')
    .command('开舟团')
    .action(async ({ session }) => {
      await session.send(segment('quote', { id: session.messageId }) + '请将开团信息发送上来哦~你的下一条消息将作为公告在四个群广播\n可以输入"取消"以停止。')
      const info = await session.prompt(Time.minute)
      if (!info || info === '取消') {
        await session.send(segment('quote', { id: session.messageId }) + '还没有想好吗？没有关系，之后再来也可以哦~')
        return
      }
      //长度不可以超过公告长度
      if (info.length > 600) {
        await session.send(`请适当缩减长度，当前字数${info.length}/600`)
        return
      }
      if (!checkTrpg(info)) {
        await session.send('格式不合规范，请阅读群公告')
        return
      }
      arkGroups.forEach(async (value) => {
        await session.bot.internal.sendGroupNotice(value, info)
      })
      await session.send('已经在四个群广播完毕√')
    })
}
