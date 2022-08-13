import { Context, segment } from 'koishi'

export const name = 'api'

export function apply(ctx: Context) {
  ctx.command('每日新闻').action(async ({ session }) => {
    ctx.http('GET', 'http://excerpt.rubaoo.com/toolman/getMiniNews')
      .then((resp) => {
        session.send(segment.image(resp.data.image))
      }).catch(() => {
        session.send('每日新闻60s api出错')
      })
  })

  ctx.command('网易云热评').alias(...["网易热评", "热评"])
    .action(async ({ session }) => {
      ctx.http('GET', 'https://api.vvhan.com/api/reping')
        .then((resp) => {
          const { name, auther, content } = resp.data
          session.send(`歌曲名：${name}，歌手：${auther}\n评论：${content}`)
        }).catch(() => {
          session.send('网易云热评api出错')
        })
    })

  ctx.command('来点段子')
    .action(async ({ session }) => {
      ctx.http('GET', 'https://apibug.cn/api/sjdz/?type=json&apiKey=1dcc73cb9542baa7625a796863c5af02')
        .then((resp) => {
          session.send(resp.data)
        }).catch(() => {
          session.send('随机段子api出错')
        })
    })

  ctx.command('来点彩虹屁').alias(...['彩虹屁', '来点夸夸'])
    .action(async ({ session }) => {
      ctx.http('GET', 'https://apibug.cn/api/chp/&apiKey=9929192683301591c2ffd23658913289')
        .then((resp) => {
          session.send(resp)
        }).catch(() => {
          session.send('彩虹屁api出错')
        })
    })

  ctx.command('对话 <msg:text>')
    .action(async ({ args, session }) => {
      const msg = args[0].replace('茉莉', '小爱')
      ctx.http('GET', encodeURI(`https://apibug.cn/api/xiaoai/?msg=${msg}&apiKey=036a8de02aaf338868b758d290394aab`))
        .then((resp) => {
          let text = resp.text as string
          text = text.replace('小爱', '茉莉').replace('小米', '').replace('同学', '')
          session.send(text)
        }).catch(() => {
          session.send('对话api出错')
        })
    })
}
