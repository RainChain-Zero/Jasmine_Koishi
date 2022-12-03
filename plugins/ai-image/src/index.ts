import { Context, Schema, segment } from 'koishi'

export const name = 'ai-image'

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

const whiteGroup = ['436159372', '921454429']

const negativePrompts = 'bad anatomy, bad hands, bad feet, bad anatomy, bad hands, bad digit, blurry,cropped, censored, chibi,deformed,error, extra digit, extra fingers, extra limbs, extra arms, {{extra legs}}, extra hairs,explosure clothes,fewer digits, fewer digits, fused digit, jpeg artifacts, lowres, low quality, missing fingers, missing legs, missing digit, mutation, malformed limbs, mutated hands,  more than 2 nipples, {{{{missing arms}}}}, nsfw, normal quality, one hand with more than 5 fingers, one hand with less than 5 fingers, one hand with more than 5 digit, one hand with less than 5 digit, poorly drawn hands, poorly drawn face, revealing clothes, revealed clothes, signature, text, {{{{too many fingers}}}}, username, worst quality, watermark,{{{ugly}}},{{{duplicate}}},{{morbid}}, {{mutilated}}, {{{tranny}}}, mutated hands,{{{poorly drawn hands}}},{{{bad proportions}}}, extra limbs, cloned face,{{{disfigured}}}, {{{more than 2 nipples}}},{{{{{fused fingers}}}}},{{{unclear eyes}}},malformed hands,{mutated hand and finger: 1.5},{long body: 1.3},{mutation poorly drawn: 1.2},disfigured, malformed mutated, {{{{:3}}}},{{{{sharp fingers}}}},wrong figernails,long hand,double middle finger,index fingers together,missing indexfinger,interlocked fingers,pieck fingers,{{{{sharp fingernails}}}},{steepled fingers},x fingers,curled fingers,interlocked fingers,fingers different thickness,cross fingers,poor outline,big fingers,finger growth,outline on body,outline on hair,out line on background,outline not on fingers,more than two elbow,hand:fingers(1:5),arm:finger(1:1)'
const positivePrompts = 'extremely detailed CG unity 8k wallpaper, {{masterpiece}}, {highres}, {best quality}, {extremely delicate and beautiful}'

export function apply(ctx: Context) {
  ctx.guild(...whiteGroup).command('nai <prompts:text>')
    .option("seed", '-x <seed:number>')
    .option("scale", '-c <scale:number>', { fallback: 12 })
    .option('width', '-w <width:number>', { fallback: 512 })
    .option('height', '-h <height:number>', { fallback: 768 })
    .action(async ({ session, options }, input) => {
      const seed = options.seed ? options.seed : Math.floor(Math.random() * (Date.now() / 1000 + 1))
      let imgUrl: string
      input = segment.transform(input, {
        image(attrs) {
          imgUrl = attrs.url
          return ''
        }
      })
      console.log(imgUrl)
      //排除词条
      const undesired = input.match(/(?:,?\s*)negative prompts?:([\s\S]+)/m)
      const negative = negativePrompts.split(/,\s*/g)
      if (undesired) {
        input = input.slice(0, undesired.index).trim()
        //去重
        for (let tag of undesired[1].split(/,\s*/g)) {
          tag = tag.trim().toLowerCase()
          if (tag && !negative.includes(tag)) negative.push(tag)
        }
      }
      //去重
      const prompts = positivePrompts.split(/,\s*/g)
      for (let tag of input.split(/,\s*/g)) {
        tag = tag.trim().toLowerCase()
        if (tag && !prompts.includes(tag)) prompts.push(tag)
      }
      const data = {
        prompt: prompts.join(', '),
        width: options.width,
        height: options.height,
        cfg_scale: options.scale,
        n_iter: 1,
        step: 40,
        seed: seed,
        batch_size: 1,
        sampler_index: "Euler",
        negative_prompt: negative.join(', '),
      }
      ctx.http.axios('http://261090.proxy.nscc-gz.cn:8888/' + (imgUrl ? 'img2img' : ''), {
        method: 'POST',
        data: imgUrl ? { url: imgUrl, ...data } : data,
      }).then(res => {
        session.send(segment.quote(session.messageId) + `seed：${seed}\nurl：${res.data}` + segment.image(res.data))
      }).catch(err => {
        console.error(err)
        session.send('上游服务器错误，请稍后再试或报告此问题')
      })
    })
}