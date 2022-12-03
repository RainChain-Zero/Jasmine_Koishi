import { collect, comment, deleteBottle, deleteCollect, deleteComment, getCollect, getComment, getThumbs, giveThumbs, pickBottle, throwBottle } from './apis/index';
import { Context, Logger, Schema, segment, Time } from 'koishi'
import { downloadPic } from './apis'
import * as fs from 'fs-extra';
import { buildForwardMessage } from './utils';

export const name = 'drift-bottle'

export interface Config {
  picPath: string
}

export const Config: Schema<Config> = Schema.object({
  picPath: Schema.string().required(),
})

export function apply(ctx: Context, config: Config) {
  ctx.command('throw [message:text]').option('anonymous', '-a', { value: true, fallback: false })
    .action(async ({ session, options }, input) => {
      let ids: string[]
      if (!input) {
        ids = await session.send('请把想写在瓶子里的话发上来吧~')
        input = await session.prompt(Time.minute)
      }
      if (ids) {
        ctx.setTimeout(() => {
          for (const id of ids) {
            session.bot.deleteMessage(session.channelId, id)
          }
        }, 2000)
      }
      //如果还是没有获取到消息，就结束
      if (!input) {
        return '还没有想好吗？没关系，茉莉一直都在哦~'
      }
      //纯文本不可以少于6个字
      if (input.replace(/<image.*\/>/g, '').length <= 6) {
        return '瓶子的文字内容不能少于6个字哦~'
      }
      const messageOri = segment.parse(input)
      const bottleContent = []
      for (let msg of messageOri) {
        if (msg.type === 'text') {
          bottleContent.push(msg.attrs.content.trim())
        } else if (msg.type === 'image') {
          const pic = await downloadPic(ctx, msg.attrs.url, config.picPath)
          if (pic) {
            bottleContent.push(`[[${pic}]]`)
          } else {
            return '图片下载失败，请稍后再试'
          }
        }
      }
      throwBottle(ctx, {
        id: undefined,
        type: 1,
        qq: session.userId,
        nick: session.username,
        group: session.guildId,
        groupName: session.guildName,
        content: bottleContent.join('\n'),
        anonymous: options.anonymous,
        timeStamp: undefined
      }).then(res => {
        if (!res.data.succ) {
          session.send('丢瓶子失败了×请联系管理员')
          console.error(res.data.errMsg)
        } else {
          session.send(segment.quote(session.messageId) + `嘿咻——茉莉已经把瓶子扔出去了哦~给，这是序号【${res.data.data}】`)
        }
      }).catch(err => {
        session.send('丢瓶子失败了×请联系管理员')
        console.error(err)
      })
    })

  ctx.command('pick [id:number]').action(async ({ session, args }) => {
    const bottle = await pickBottle(ctx, args[0])
    if (!bottle && args[0]) {
      return '茉莉找不到这个瓶子哦~'
    }
    let res = `序号：${bottle.id}\n你在海边捡到了一个`
    if (bottle.anonymous) {
      res += '来自【██████】扔下的漂流瓶，打开瓶子，里面有一张纸条，写着：\n'
    } else if (bottle.group) {
      res += `来自【${bottle.groupName}】的【${bottle.nick}】扔下的漂流瓶，打开瓶子，里面有一张纸条，写着：\n`
    } else {
      res += `来自【${bottle.nick}】悄悄扔下的漂流瓶，打开瓶子，里面有一张纸条，写着：\n`
    }
    const msgs = bottle.content.split('\n')
    for (const msg of msgs) {
      //图片替换
      if (msg.startsWith('[[') && msg.endsWith(']]')) {
        const pic = msg.substring(2, msg.length - 2)
        res += segment.image(fs.readFileSync(`${config.picPath}/${pic}`)) + '\n'
      } else {
        res += msg + '\n'
      }
    }
    //获取评论和点赞（踩）数
    Promise.all([getComment(ctx, bottle.id), getThumbs(ctx, bottle.id)]).then(result => {
      const [comment, thumbs] = result
      if (thumbs.data.succ) {
        const [up, down] = thumbs.data.data.split(',')
        res += `这个瓶子被【${up}】人点赞，【${down}】人踩了\n`
      }
      if (comment.data.succ) {
        if (comment.data.data.length > 0) {
          res += '此漂流瓶的评论为：\n'
          for (const c of comment.data.data) {
            res += `${c.qq}：${c.content}\n`
          }
        }
      } else {
        console.error(comment.data.errMsg)
        res += '获取评论失败，请联系管理员\n'
      }
    }).catch(err => {
      console.error(err)
      res += '获取评论和点赞、踩数失败'
    }).finally(() => {
      session.send(res.trim())
    })
  })

  ctx.command('delb <id:number>').action(async ({ session, args }) => {
    deleteBottle(ctx, args[0], session.userId).then(res => {
      if (!res.data.succ) {
        session.send('删除失败×请联系管理员')
        console.error(res.data.errMsg)
      } else {
        session.send(res.data.data >= 1 ? `已经删除序号为${args[0]}的瓶子啦~` : '删除失败，可能序号不存在或权限不足')
      }
    }).catch(err => {
      session.send('删除失败×请联系管理员')
      console.error(err)
    })
  })

  ctx.command('评论 <id:number> <content:string>').option('anonymous', '-a', { value: true, fallback: false })
    .action(async ({ session, args, options }) => {
      comment(ctx, {
        bottleId: args[0],
        qq: session.userId,
        nick: session.username,
        content: args[1],
        anonymous: options.anonymous
      }).then(res => {
        if (!res.data.succ) {
          session.send(res.data.errMsg)
          console.error(res.data.errMsg)
        } else {
          session.send(`你已评论了序号为${args[0]}的瓶子`)
        }
      }).catch(err => {
        session.send('评论失败×请联系管理员')
        console.error(err)
      })
    })

  ctx.command('delc <id:number>').action(async ({ session, args }) => {
    deleteComment(ctx, args[0], session.userId).then(res => {
      if (!res.data.succ) {
        session.send('删除失败×请联系管理员')
        console.error(res.data.errMsg)
      } else {
        session.send(res.data.data >= 1 ? `已删除您在序号为${args[0]}瓶子的评论` : '删除失败，可能序号不存在或权限不足')
      }
    }).catch(err => {
      session.send('删除失败×请联系管理员')
      console.error(err)
    })
  })

  ctx.command('点赞 <id:number>').action(async ({ session, args }) => {
    giveThumbs(ctx, {
      qq: session.userId,
      id: args[0],
      thumbsUp: true
    }).then(res => {
      if (!res.data.succ) {
        session.send(res.data.errMsg)
        console.error(res.data.errMsg)
      } else {
        session.send(`你已点赞了序号为${args[0]}的瓶子`)
      }
    }).catch(err => {
      session.send('点赞失败×请联系管理员')
      console.error(err)
    })
  })

  ctx.command('点踩 <id:number>').action(async ({ session, args }) => {
    giveThumbs(ctx, {
      qq: session.userId,
      id: args[0],
      thumbsUp: false
    }).then(res => {
      if (!res.data.succ) {
        session.send(res.data.errMsg)
        console.error(res.data.errMsg)
      } else {
        session.send(`你已踩了序号为${args[0]}的瓶子`)
      }
    }).catch(err => {
      session.send('点踩失败×请联系管理员')
      console.error(err)
    })
  })

  ctx.command('收藏 <id:number>').action(async ({ session, args }) => {
    collect(ctx, args[0], session.userId).then(res => {
      if (!res.data.succ) {
        session.send(res.data.errMsg)
        console.error(res.data.errMsg)
      } else {
        session.send(`你已收藏了序号为${args[0]}的瓶子`)
      }
    }).catch(err => {
      session.send('收藏失败×请联系管理员')
      console.error(err)
    })
  })

  ctx.command('取消收藏 <id:number>').action(async ({ session, args }) => {
    deleteCollect(ctx, args[0], session.userId).then(res => {
      if (!res.data.succ) {
        session.send('取消收藏失败×请联系管理员')
        console.error(res.data.errMsg)
      } else {
        session.send(res.data.data > 0 ? `你已取消收藏序号为${args[0]}的瓶子` : '取消收藏失败，你似乎没有收藏过这个瓶子')
      }
    }).catch(err => {
      session.send('取消收藏失败×请联系管理员')
      console.error(err)
    })
  })

  ctx.command('我的收藏').action(async ({ session }) => {
    getCollect(ctx, session.userId).then(async (res) => {
      if (!res.data.succ) {
        session.send('获取收藏失败×请联系管理员')
        console.error(res.data.errMsg)
      } else {
        await session.send(buildForwardMessage(session, res))
      }
    }).catch(err => {
      session.send('获取收藏失败×请联系管理员')
      console.error(err)
    })
  })

}

