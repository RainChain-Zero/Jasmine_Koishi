import { Context } from 'koishi'

export const downloadPic = async (ctx: Context, url: string, path: string) => {
    const UUID = require('uuid-js')
    const uuid1 = UUID.create(1).toString()
    return await ctx.http.axios(url, { method: 'GET', responseType: 'stream' })
        .then(res => {
            // 将图片流式下载
            res.data.pipe(require('fs').createWriteStream(`${path}/${uuid1}.gif`))
            return uuid1 + '.gif'
        }).catch(err => {
            console.log(err)
            return false
        })
}

const baseUrl = 'http://localhost:45445/'

type bottle = {
    type: 0 | 1,
    qq: string,
    nick: string,
    group: string,
    groupName: string,
    content: string,
    anonymous: boolean,
}
export const throwBottle = (ctx: Context, bottle: bottle) => {
    return ctx.http.axios(baseUrl + 'throw', {
        method: 'POST',
        data: bottle
    })
}
