import { Context, Dict, Logger, Quester, Schema, segment, Session, Time, trimSlash } from 'koishi'
import { download, getImageSize, login, NetworkError, resizeInput, getFl, setFl } from './utils'
import { } from '@koishijs/plugin-help'

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
const highQuality = 'extremely detailed CG unity 8k wallpaper, {{masterpiece}}, {highres}, {best quality}, {extremely delicate and beautiful}'

type Model = keyof typeof modelMap
type Orient = keyof typeof orientMap
type Sampler = typeof samplers[number]

const models = Object.keys(modelMap) as Model[]
const orients = Object.keys(orientMap) as Orient[]
const samplers = ['k_euler_ancestral', 'k_euler', 'k_lms', 'plms', 'ddim'] as const

export interface Config {
  type: 'token' | 'login' | 'naifu'
  token: string
  email: string
  password: string
  model?: Model
  orient?: Orient
  sampler?: Sampler
  anatomy?: boolean
  allowAnlas?: boolean
  basePrompt?: string
  forbidden?: string
  endpoint?: string
  headers?: Dict<string>
  requestTimeout?: number
  recallTimeout?: number
  maxConcurrency?: number
}

export const Config = Schema.intersect([
  Schema.object({
    type: Schema.union([
      Schema.const('token' as const).description('授权令牌'),
      ...process.env.KOISHI_ENV === 'browser' ? [] : [Schema.const('login' as const).description('账号密码')],
      Schema.const('naifu' as const).description('NAIFU'),
    ] as const).description('登录方式'),
  }).description('登录设置'),
  Schema.union([
    Schema.object({
      type: Schema.const('token' as const),
      token: Schema.string().description('授权令牌。').role('secret').required(),
      endpoint: Schema.string().description('API 服务器地址。').default('https://api.novelai.net'),
      headers: Schema.dict(String).description('要附加的额外请求头。').default({
        'referer': 'https://novelai.net/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
      }),
    }),
    Schema.object({
      type: Schema.const('login' as const),
      email: Schema.string().description('用户名。').required(),
      password: Schema.string().description('密码。').role('secret').required(),
      endpoint: Schema.string().description('API 服务器地址。').default('https://api.novelai.net'),
      headers: Schema.dict(String).description('要附加的额外请求头。').default({
        'referer': 'https://novelai.net/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
      }),
    }),
    Schema.object({
      type: Schema.const('naifu' as const),
      token: Schema.string().description('授权令牌。').role('secret'),
      endpoint: Schema.string().description('API 服务器地址。').required(),
      headers: Schema.dict(String).description('要附加的额外请求头。'),
    }),
  ] as const),
  Schema.object({
    model: Schema.union(models).description('默认的生成模型。').default('nai'),
    orient: Schema.union(orients).description('默认的图片方向。').default('portrait'),
    sampler: Schema.union(samplers).description('默认的采样器。').default('k_euler_ancestral'),
    anatomy: Schema.boolean().default(true).description('是否过滤不合理构图。'),
    allowAnlas: Schema.boolean().default(true).description('是否允许使用点数。禁用后部分功能 (图片增强和手动设置某些参数) 将无法使用。'),
    basePrompt: Schema.string().description('默认的附加标签。').default('masterpiece, best quality'),
    forbidden: Schema.string().role('textarea').description('违禁词列表。含有违禁词的请求将被拒绝。').default(''),
    requestTimeout: Schema.number().role('time').description('当请求超过这个时间时会中止并提示超时。').default(Time.minute),
    recallTimeout: Schema.number().role('time').description('图片发送后自动撤回的时间 (设置为 0 以禁用此功能)。').default(0),
    maxConcurrency: Schema.number().description('单个频道下的最大并发数量 (设置为 0 以禁用此功能)。').default(1),
  }).description('功能设置'),
] as const) as Schema<Config>

function errorHandler(session: Session, err: Error) {
  if (Quester.isAxiosError(err)) {
    if (err.response?.status === 402) {
      return session.text('.unauthorized')
    } else if (err.response?.status) {
      return session.text('.response-error', [err.response.status])
    } else if (err.code === 'ETIMEDOUT') {
      return session.text('.request-timeout')
    } else if (err.code) {
      return session.text('.request-failed', [err.code])
    }
  }
  logger.error(err)
  return session.text('.unknown-error')
}

interface Forbidden {
  pattern: string
  strict: boolean
}

export function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh', require('./locales/zh'))

  let forbidden: Forbidden[]
  const tasks: Dict<Set<string>> = Object.create(null)
  const globalTasks = new Set<string>()

  ctx.accept(['forbidden'], (config) => {
    forbidden = config.forbidden.trim()
      .toLowerCase()
      .replace(/，/g, ',')
      .split(/(?:,\s*|\s*\n\s*)/g)
      .filter(Boolean)
      .map((pattern: string) => {
        const strict = pattern.endsWith('!')
        if (strict) pattern = pattern.slice(0, -1)
        pattern = pattern.replace(/[^a-z0-9]+/g, ' ').trim()
        return { pattern, strict }
      })
  }, { immediate: true })

  let tokenTask: Promise<string> = null
  const getToken = () => tokenTask ||= login(ctx)
  ctx.accept(['token', 'type', 'email', 'password'], () => tokenTask = null)

  const hidden = () => !config.allowAnlas

  const cmd = ctx.guild('436159372', '921454429').command('novelai <prompts:text>')
    .alias('nai')
    .option('enhance', '-e', { hidden })
    .option('model', '-m <model>', { type: models })
    .option('orient', '-o <orient>', { type: orients })
    .option('sampler', '-s <sampler>', { type: samplers })
    .option('seed', '-x <seed:number>')
    .option('steps', '-t <step:number>', { hidden })
    .option('scale', '-c <scale:number>')
    .option('noise', '-n <noise:number>', { hidden })
    .option('strength', '-N <strength:number>', { hidden })
    .option('anatomy', '-a, --strict-anatomy', { value: true, hidden: () => ctx.config.anatomy })
    .option('anatomy', '-A, --loose-anatomy', { value: false, hidden: () => !ctx.config.anatomy })
    .action(async ({ session, options }, input) => {
      if (!input?.trim()) return session.execute('help novelai')

      let imgUrl: string
      //fl数，消耗点数将扣除fl
      let fl: number, isAnlasUsed: boolean = false
      if (config.allowAnlas) {
        input = segment.transform(input, {
          image(attrs) {
            imgUrl = attrs.url
            return ''
          },
        })

        //! img2img需要fl
        if (imgUrl || options.steps) {
          isAnlasUsed = true
          fl = await getFl(ctx, session.userId)
          if (fl < 50) {
            return session.text('.less-fl')
          }
        }

        if (options.enhance && !imgUrl) {
          return session.text('.expect-image')
        }

        if (!input.trim() && !config.basePrompt) {
          return session.text('.expect-prompt')
        }
      } else {
        delete options.steps
      }
      //! 禁止图片增强
      delete options.enhance

      input = input.toLowerCase().replace(/[,，]/g, ', ').replace(/\s+/g, ' ')
      if (/[^\s\w"'“”‘’.,:|()\[\]{}-]/.test(input)) {
        return session.text('.invalid-input')
      }

      // extract negative prompts
      const undesired = [lowQuality]
      if (options.anatomy ?? config.anatomy) undesired.push(badAnatomy)
      const capture = input.match(/(?:,?\s*)negative prompts?:([\s\S]+)/m)
      if (capture) {
        input = input.slice(0, capture.index).trim()
        undesired.push(capture[1])
      }

      // remove forbidden words
      const words = input.split(/, /g).filter((word) => {
        word = word.replace(/[^a-z0-9]+/g, ' ').trim()
        if (!word) return false
        for (const { pattern, strict } of forbidden) {
          if (strict && word.split(/\W+/g).includes(pattern)) {
            return false
          } else if (!strict && word.includes(pattern)) {
            return false
          }
        }
        return true
      })

      // append base prompt when input does not include it
      for (let tag of config.basePrompt.split(/,\s*/g)) {
        tag = tag.trim().toLowerCase()
        if (tag && !words.includes(tag)) words.push(tag)
      }
      //! 置入高品质词条
      words.push(highQuality)
      input = words.join(', ')

      let token: string
      try {
        token = await getToken()
      } catch (err) {
        if (err instanceof NetworkError) {
          return session.text(err.message, err.params)
        }
        logger.error(err)
        return session.text('.unknown-error')
      }

      const model = modelMap[options.model]
      const orient = orientMap[options.orient]
      // seed can be up to 2^32
      const seed = options.seed || Math.floor(Math.random() * Math.pow(2, 32))

      const parameters: Dict = {
        seed,
        n_samples: 1,
        sampler: options.sampler,
        uc: undesired.join(', '),
        ucPreset: 0,
      }

      if (imgUrl) {
        //! img2img，不可以修改step
        delete options.steps

        let image: [ArrayBuffer, string]
        try {
          image = await download(ctx, imgUrl)
        } catch (err) {
          if (err instanceof NetworkError) {
            return session.text(err.message, err.params)
          }
          logger.error(err)
          return session.text('.download-error')
        }

        const size = getImageSize(image[0])
        Object.assign(parameters, {
          image: image[1],
          scale: options.scale ?? 11,
          steps: options.steps ?? 50,
        })
        if (options.enhance) {
          if (size.width + size.height !== 1280) {
            return session.text('.invalid-size')
          }
          Object.assign(parameters, {
            height: size.height * 1.5,
            width: size.width * 1.5,
            noise: options.noise ?? 0,
            strength: options.strength ?? 0.2,
          })
        } else {
          const orient = resizeInput(size)
          Object.assign(parameters, {
            height: orient.height,
            width: orient.width,
            noise: options.noise ?? 0.2,
            strength: options.strength ?? 0.7,
          })
        }
      } else {
        Object.assign(parameters, {
          height: orient.height,
          width: orient.width,
          scale: options.scale ?? 12,
          steps: options.steps ?? 28,
          noise: options.noise ?? 0.2,
          strength: options.strength ?? 0.7,
        })
      }

      const id = Math.random().toString(36).slice(2)
      if (config.maxConcurrency) {
        const store = tasks[session.cid] ||= new Set()
        if (store.size >= config.maxConcurrency) {
          return session.text('.concurrent-jobs')
        } else {
          store.add(id)
        }
      }

      try {
        const path = config.type === 'naifu' ? '/generate-stream' : '/ai/generate-image'
        const art = await ctx.http.axios(trimSlash(config.endpoint) + path, {
          method: 'POST',
          timeout: config.requestTimeout,
          headers: {
            ...config.headers,
            authorization: 'Bearer ' + token,
          },
          data: config.type === 'naifu'
            ? { ...parameters, prompt: input }
            : { model, input, parameters },
        }).then((res) => {
          // event: newImage
          // id: 1
          // data:
          return res.data.slice(27)
        })

        if (!art.trim()) return session.text('.empty-response')

        const reply = `seed: ${seed}` + (isAnlasUsed ? '，已扣除50fl' : '')
        const ids = await session.send(segment.quote(session.messageId) + reply + segment.image('base64://' + art))
        if (config.recallTimeout) {
          ctx.setTimeout(() => {
            for (const id of ids) {
              session.bot.deleteMessage(session.channelId, id)
            }
          }, config.recallTimeout)
        }
      } catch (err) {
        return errorHandler(session, err)
      } finally {
        tasks[session.cid]?.delete(id)
        globalTasks.delete(id)
      }
      //! 修改fl
      if (isAnlasUsed) {
        await setFl(ctx, session.userId, fl - 50)
      }
    })

  ctx.accept(['model', 'orient', 'sampler'], (config) => {
    cmd._options.model.fallback = config.model
    cmd._options.orient.fallback = config.orient
    cmd._options.sampler.fallback = config.sampler
  }, { immediate: true })
}
