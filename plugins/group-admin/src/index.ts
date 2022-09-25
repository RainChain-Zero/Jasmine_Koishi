import { Bot, Context, Schema, segment } from 'koishi'
import '@koishijs/plugin-adapter-onebot'
export const name = 'group-ban'

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

//茉莉为群主的群
const groups = ['921454429', '627524350', '233905068']
export function apply(ctx: Context) {
  ctx.guild(...groups)
    .command('群头衔 <name:text>')
    .action(async ({ args, session }) => {
      const qq = parseInt(session.uid.match(/(\d+)/g).join(''))
      const name = typeof (args[0]) === 'undefined' ? '' : args[0]
      if (name.length > 6) {
        await session.send(segment('quote', { id: session.messageId }) + '头衔字数最多6个字哦☆')
        return
      }
      await session.onebot.setGroupSpecialTitleAsync(parseInt(session.guildId), qq, name)
      await session.send(segment('quote', { id: session.messageId }) + `已将群头衔修改为${name}√`)
    })

  ctx.guild()
    .command('/设精')
    .action(async ({ session }) => {

    })
}
