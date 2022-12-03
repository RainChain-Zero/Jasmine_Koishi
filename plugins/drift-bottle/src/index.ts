import { collect, comment, deleteBottle, deleteCollect, deleteComment, getCollect, getComment, getMyBottle, getReplyBottle, getThumbs, giveThumbs, pickBottle, searchByKeywords, throwBottle, jumpSea } from './apis/index';
import { Context, Schema, segment, Time } from 'koishi'
import { downloadPic } from './apis'
import * as fs from 'fs-extra';
import { buildForwardMessage } from './utils';
import moment from 'moment';
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
      if (bottleContent.length === 0) {
        return '只能往漂流瓶中放入文字或文字+图片哦~'
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
    //尸体
    if (bottle.type === 0) {
      let res = segment.image(`http://q1.qlogo.cn/g?b=qq&nk=${bottle.qq}&s=640`) + `\n海面上飘来了【${bottle.nick}】的浮尸...\n他于【${moment(bottle.timeStamp).format('YYYY-MM-DD HH:mm:ss')}】`
      res += bottle.group ? `在【${bottle.groupName}（${bottle.group}）】的海边沉入了深海...` : '悄悄潜入深海，愿深蓝之意志保佑他的灵魂...'
      return res
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
          res += '下面还有密密麻麻的小字，似乎是他人所为：\n'
          for (const c of comment.data.data) {
            res += `${c.nick}：${c.content}\n`
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

  ctx.command('跳海').action(async ({ session }) => {
    jumpSea(ctx, {
      id: undefined,
      type: 0,
      qq: session.userId,
      nick: session.username,
      group: session.guildId,
      groupName: session.guildName,
      content: undefined,
      anonymous: false,
      timeStamp: undefined
    }).then(res => {
      if (!res.data.succ) {
        session.send('跳海失败了×请联系管理员')
        console.error(res.data.errMsg)
      } else {
        session.send(segment.quote(session.messageId) + `你缓缓走入大海，感受着海浪轻柔地拍打着你的小腿，膝盖……\n波浪卷着你的腰腹，你感觉有些把握不住平衡了……\n……\n你沉入海中，【${res.data.data}】个物体与你一同沉浮。\n不知何处涌来一股暗流，你失去了意识。`)
      }
    }).catch(err => {
      session.send('跳海失败了×请联系管理员')
      console.error(err)
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

  ctx.command('我的评论').action(async ({ session }) => {
    getReplyBottle(ctx, session.userId).then(async (res) => {
      if (!res.data.succ) {
        session.send('获取评论失败×请联系管理员')
        console.error(res.data.errMsg)
      } else {
        await session.send(buildForwardMessage(session, res))
      }
    }).catch(err => {
      session.send('获取评论失败×请联系管理员')
      console.error(err)
    })
  })

  ctx.command('我的瓶子').action(async ({ session }) => {
    getMyBottle(ctx, session.userId).then(async (res) => {
      if (!res.data.succ) {
        session.send('获取瓶子失败×请联系管理员')
        console.error(res.data.errMsg)
      } else {
        await session.send(buildForwardMessage(session, res))
      }
    }).catch(err => {
      session.send('获取瓶子失败×请联系管理员')
      console.error(err)
    })
  })

  ctx.command('找瓶子 <keywords:text>').action(async ({ session }, input) => {
    const keywords = input.split(/[\s,，]+/g).filter(key => key.length > 1)
    if (keywords.length === 0) {
      return '请输入有效的关键词，用空白符或逗号分隔，各关键词长度必须大于1'
    }
    searchByKeywords(ctx, keywords).then(async (res) => {
      if (!res.data.succ) {
        session.send('搜索失败×请联系管理员')
        console.error(res.data.errMsg)
      } else {
        await session.send(buildForwardMessage(session, res))
      }
    }).catch(err => {
      session.send('搜索失败×请联系管理员')
      console.error(err)
    })
  })
}

