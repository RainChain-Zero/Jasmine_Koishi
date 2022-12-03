import { Context, Logger, Quester, Schema, segment, Session, Time } from 'koishi'
import { download, NetworkError, generate_code, headers } from './utils'
import '@koishijs/plugin-adapter-onebot'


import { } from '@koishijs/plugin-help'
export const name = 'deep-danbooru'
const logger = new Logger(name)

enum actions {
  PUSH = '/push/',
  STATUS = '/status/',
}

export interface Config {
  hfUrl?: string
}

export const Config: Schema<Config> = Schema.object({
  hfUrl: Schema.string().role('textarea').description('Hugging Face Space 推送接口 <br> 获取方法：打开某一个 space，打开 Developer Tools，转至 Network 标签页，点击 App 中的 Input 上传图片，点击 Submit，此时得到了一个类似于 https://hf.space/embed/user/DeepDanbooru/api/queue/action 的链接，取 https://hf.space/embed/user/DeepDanbooru/api/queue 置入此处').default('https://nocrypt-deepdanbooru-string.hf.space/api/queue'),
}).description('DeepDanbooru 相关配置')


function errorHandler(session: Session, err: Error) {
  if (Quester.isAxiosError(err)) {
    logger.error(err)
    if (err.response?.status === 402) {
      return session.text('unauthorized')
    } else if (err.response?.status) {
      return session.text(`请求出现错误 (HTTP ${err.response.status})`)
    } else if (err.code === 'ETIMEDOUT') {
      return session.text('请求超时了')
    } else if (err.code) {
      return session.text('请求失败了 (错误代码: ' + err.code + ')')
    }
  }
  logger.error(err)
  return session.text('发生了未知的错误')
}


export function apply(ctx: Context, config: Config) {
  ctx.guild('921454429', '436159372')
    .command('deepdanbooru <image:text>')
    .alias("ddb")
    .option('api', '-a <url:string> 输入推送的 API Mirror, 默认使用配置项。')
    .action(async ({ session, options }, input) => {
      if (!input?.trim()) {
        await session.send('请输入待分析的图片')
        input = await session.prompt(Time.minute)
      }
      const hfUrl = (options.api?.trimEnd() || config.hfUrl).replace(/\/$/, '')

      let imgUrl: string

      input = segment.transform(input, {
        image(attrs) {
          imgUrl = attrs.url
          return ''
        },
      })
      if (!imgUrl) {
        return session.text('没有检测到图片，请检查格式并给出图片。')
      }

      let imageBuff: Buffer
      try {
        imageBuff = Buffer.from(await download(ctx, imgUrl))
      } catch (err) {
        if (err instanceof NetworkError) {
          return session.text(err.message, err.params)
        }
        logger.error(err)
        return session.text("图片加载失败了！")
      }


      const body = {
        "action": "predict",
        "fn_index": 0,
        "data": [`data:image/png;base64,${String(imageBuff.toString('base64'))}`, 0.5],
        "session_hash": generate_code(11),
      }

      const art = await ctx.http.axios(hfUrl + actions.PUSH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        responseType: 'json',
        data: JSON.stringify(body)
      }).then(res => {
        return {
          hash: res.data.hash,
        }
      })

      const getStatus = async (hash: string) => {
        return await ctx.http.axios(hfUrl + actions.STATUS, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          responseType: 'json',
          data: JSON.stringify({
            'hash': hash
          })
        }).then(res => {
          let data = res.data
          if (res.data.status === 'PENDING') {
            data = getStatus(hash)
          }
          return data
        }).catch(err => {
          return errorHandler(session, err)
        })
      }
      const result = await getStatus(art.hash)
      const attrs = {
        userId: session.userId,
        nickname: session.author?.nickname || session.username,
      }
      try {
        const reply1 = `tags:\n${result.data.data[2].confidences.map((tag: any) => { return tag.label })}`
          + '\n若要获得更好的效果，请根据第二条消息调整权重'
        const reply2 = `tags:\n${result.data.data[2].confidences.map((tag: any) => {
          return `${tag.label}：${(tag.confidence * 100).toFixed(2)}%\n`
        })}`.replace(/,/g, '')
        await session.send(segment('figure', [
          segment('message', attrs, reply1),
          segment('message', attrs, reply2),
        ]))

      }
      catch (err) {
        session.send('发生未知错误，可能是网络故障')
        logger.error(err)
      }
    })
}
