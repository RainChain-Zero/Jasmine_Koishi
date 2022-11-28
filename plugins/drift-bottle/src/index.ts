import { throwBottle } from './apis/index';
import { Context, Logger, Schema, segment, Time } from 'koishi'
import { downloadPic } from './apis'
import * as fs from 'fs-extra';

export const name = 'drift-bottle'

export interface Config {
  picPath: string
}

export const Config: Schema<Config> = Schema.object({
  picPath: Schema.string().required(),
})

export function apply(ctx: Context, config: Config) {
  ctx.command('throw').option('anonymous', '-a', { value: true, fallback: false })
    .action(async ({ session }) => {
      //获取原消息
      let msgOri = session.content.substring(6).trim()
      let ids: string[]
      if (!msgOri) {
        ids = await session.send('请把想写在瓶子里的话发上来吧~')
        msgOri = await session.prompt(Time.minute)
      }
      ctx.setTimeout(() => {
        for (const id of ids) {
          session.bot.deleteMessage(session.channelId, id)
        }
      }, 2000)
      //如果还是没有获取到消息，就结束
      if (!msgOri) {
        return '还没有想好吗？没关系，茉莉一直都在哦~'
      }
      const messageOri = segment.parse(msgOri)
      let textLength = 0, bottleContent = [], picAll = []
      for (let msg of messageOri) {
        if (msg.type === 'text') {
          const text = msg.attrs.content.trim()
          textLength += text.length
          bottleContent.push(text)
        } else if (msg.type === 'image') {
          const pic = await downloadPic(ctx, msg.attrs.url, config.picPath)
          picAll.push(pic)
          if (pic) {
            bottleContent.push(`[[${pic}]]`)
          } else {
            return '图片下载失败，请稍后再试'
          }
        }
      }
      if (textLength <= 6) {
        for (const pic of picAll) {
          await fs.unlink(`${config.picPath}/${pic}`)
        }
        return '瓶子的文字内容不能少于6个字哦~'
      }
      throwBottle(ctx, {
        type: 1,
        qq: session.userId,
        nick: session.username,
        group: session.guildId,
        groupName: session.guildName,
        content: bottleContent.join('\n'),
        anonymous: false
      }).then(res => {
        if (!res.data.succ) {
          session.send('丢瓶子失败了×请联系管理员')
          console.error(res.data.errMsg)
        } else {
          session.send(segment.quote(session.messageId) + '嘿咻——茉莉已经把瓶子扔出去了哦~希望有人能捡到吧')
        }
      }).catch(err => {
        session.send('丢瓶子失败了×请联系管理员')
        console.error(err)
      })
    })
}
