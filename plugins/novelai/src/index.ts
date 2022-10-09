import { Context, Dict, Logger, Quester, Schema, segment, Session, Time } from 'koishi'
import { download } from './utils'
import getImageSize from 'image-size'

export const reactive = true
export const name = 'novelai'

const logger = new Logger('novelai')

const modelMap = {
  safe: 'safe-diffusion',
  nai: 'nai-diffusion',
  furry: 'nai-diffusion-furry',
} as const

const orientMap = {
  landscape: { height: 512, width: 768 },
  portrait: { height: 768, width: 512 },
  square: { height: 640, width: 640 },
} as const

const lowQuality = 'nsfw, lowres, text, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry'
const badAnatomy = 'bad anatomy, bad hands, error, missing fingers, extra digit, fewer digits, extra fingers, fused fingers, too many fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, malformed limbs, extra limbs, more than 2 nipples, missing arms, missing legs, extra arms, extra legs'

type Model = keyof typeof modelMap
type Orient = keyof typeof orientMap
type Sampler = typeof samplers[number]

const models = Object.keys(modelMap) as Model[]
const orients = Object.keys(orientMap) as Orient[]
const samplers = ['k_euler_ancestral', 'k_euler', 'k_lms', 'plms', 'ddim'] as const

export interface Config {
  token: string
  model?: Model
  orient?: Orient
  sampler?: Sampler
  anatomy?: boolean
  allowAnlas?: boolean
  basePrompt?: string
  forbidden?: string
  endpoint?: string
  requestTimeout?: number
  recallTimeout?: number
  maxConcurrency?: number
}

export const Config: Schema<Config> = Schema.object({
  token: Schema.string().description('授权令牌。').required(),
  model: Schema.union(models).description('默认的生成模型。').default('nai'),
  orient: Schema.union(orients).description('默认的图片方向。').default('portrait'),
  sampler: Schema.union(samplers).description('默认的采样器。').default('k_euler_ancestral'),
  anatomy: Schema.boolean().default(true).description('是否过滤不合理构图。'),
  allowAnlas: Schema.boolean().default(true).description('是否允许使用点数。禁用后部分功能 (图片增强和手动设置某些参数) 将无法使用。'),
  basePrompt: Schema.string().description('默认的附加标签。').default('masterpiece, best quality'),
  forbidden: Schema.string().role('textarea').description('违禁词列表。含有违禁词的请求将被拒绝。').default(''),
  endpoint: Schema.string().description('API 服务器地址。').default('https://api.novelai.net'),
  requestTimeout: Schema.number().role('time').description('当请求超过这个时间时会中止并提示超时。').default(Time.minute * 0.5),
  recallTimeout: Schema.number().role('time').description('图片发送后自动撤回的时间 (设置为 0 以禁用此功能)。').default(0),
  maxConcurrency: Schema.number().description('单个频道下的最大并发数量 (设置为 0 以禁用此功能)。').default(0),
})

function errorHandler(session: Session, err: Error) {
  if (Quester.isAxiosError(err)) {
    if (err.response?.status === 429) {
      return session.text('.rate-limited')
    } else if (err.response?.status === 401) {
      return session.text('.invalid-token')
    }
  }
  logger.error(err)
}

function headers(config: Config) {
  return {
    authorization: 'Bearer ' + config.token,
    authority: 'api.novelai.net',
    path: '/ai/generate-image',
    'content-type': 'application/json',
    referer: 'https://novelai.net/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
  }
}

//最后一次执行的时间戳
let lastTime = 0
export function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh', require('./locales/zh'))

  let forbidden: string[]
  const states: Dict<Set<string>> = Object.create(null)

  ctx.accept(['forbidden'], (config) => {
    forbidden = config.forbidden.trim().toLowerCase().split(/\W+/g).filter(Boolean)
  }, { immediate: true })

  const hidden = () => !config.allowAnlas

  const cmd = ctx.command('novelai <prompts:text>')
    .shortcut('画画', { fuzzy: true })
    .shortcut('约稿', { fuzzy: true })
    .option('enhance', '-e', { hidden })
    .option('model', '-m <model>', { type: models, fallback: "nai" })
    .option('orient', '-o <orient>', { type: orients, fallback: "portrait" })
    .option('sampler', '-s <sampler>', { fallback: "k_euler_ancestral" })
    .option('seed', '-x <seed:number>')
    .option('steps', '-t <step:number>', { hidden })
    .option('scale', '-c <scale:number>', { hidden })
    .option('anatomy', '-a, --strict-anatomy', { value: true })
    .option('anatomy', '-A, --loose-anatomy', { value: false })
    .action(async ({ session, options }, input) => {
      if (!input?.trim()) return session.execute('help novelai')
      const nowTime = new Date().getTime() / 1000
      //cd 30s
      if (nowTime - lastTime < 30) {
        lastTime = nowTime
        return session.text('.too-fast')
      }
      lastTime = nowTime
      let imgUrl: string
      if (config.allowAnlas) {
        input = segment.transform(input, {
          image(attrs) {
            imgUrl = attrs.url
            return ''
          },
        })

        if (options.enhance && !imgUrl) {
          return session.text('.expect-image')
        }

        if (!input.trim() && !config.basePrompt) {
          return session.text('.expect-prompt')
        }
      } else {
        delete options.enhance
        delete options.steps
        delete options.scale
      }

      input = input.toLowerCase().replace(/[,，]/g, ', ').replace(/\s+/g, ' ')
      if (/[^\s\w"'“”‘’.,:|\[\]\{\}-]/.test(input)) {
        return session.text('.invalid-input')
      }

      const words = input.split(/\W+/g).filter(word => forbidden.includes(word))
      if (words.length) {
        return session.text('.forbidden-word', [words.join(', ')])
      }

      const id = Math.random().toString(36).slice(2)
      if (config.maxConcurrency) {
        states[session.cid] ||= new Set()
        if (states[session.cid].size >= config.maxConcurrency) {
          return session.text('.concurrent-jobs')
        } else {
          states[session.cid].add(id)
        }
      }

      const model = modelMap[options.model]
      const orient = orientMap[options.orient]
      const undesired = [lowQuality]
      if (options.anatomy ?? config.anatomy) undesired.push(badAnatomy)
      const seed = options.seed || Math.round(new Date().getTime() / 1000)
      session.send(session.text('.waiting'))

      const prompts = []
      if (input) prompts.push(input)
      if (config.basePrompt) prompts.push(config.basePrompt)
      input = prompts.join(', ')

      const parameters: Dict = {
        seed,
        n_samples: 1,
        sampler: options.sampler,
        uc: undesired.join(', '),
        ucPreset: 0,
      }

      if (imgUrl) {
        const image = await download(ctx, imgUrl)
        const size = getImageSize(image)
        Object.assign(parameters, {
          image: Buffer.from(image).toString('base64'),
          scale: options.scale ?? 11,
          steps: options.steps ?? 50,
        })
        if (options.enhance) {
          Object.assign(parameters, {
            height: size.height * 1.5,
            width: size.width * 1.5,
            noise: 0,
            strength: 0.2,
          })
        }
      } else {
        Object.assign(parameters, {
          scale: options.scale ?? 12,
          steps: options.steps ?? 28,
        })
      }

      if (!options.enhance) {
        Object.assign(parameters, {
          height: orient.height,
          width: orient.width,
          noise: 0.2,
          strength: 0.7,
        })
      }

      try {
        const art = await ctx.http.axios(config.endpoint + '/ai/generate-image', {
          method: 'POST',
          timeout: config.requestTimeout,
          headers: headers(config),
          data: { model, input, parameters },
        }).then(res => {
          return res.data.substr(27, res.data.length)
        })

        const attrs = {
          userId: session.selfId,
          nickname: session.text('.nickname'),
        }
        const ids = await session.send(segment.quote(session.messageId) + "您要的作品在这了哦~" + segment.image('base64://' + art))
        if (config.recallTimeout) {
          ctx.setTimeout(() => {
            for (const id of ids) {
              session.bot.deleteMessage(session.channelId, id)
            }
          }, config.recallTimeout)
        }
      } catch (err) {
        errorHandler(session, err)
        return session.text('.unknown-error')
      } finally {
        states[session.cid]?.delete(id)
      }
    })

  ctx.accept(['model', 'orient', 'sampler'], (config) => {
    cmd._options.model.fallback = config.model
    cmd._options.orient.fallback = config.orient
    cmd._options.sampler.fallback = config.sampler
  }, { immediate: true })
}
