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

const baseUrl = 'http://localhost:45445/bottle/'

type Bottle = {
    id: number | undefined
    type: 0 | 1,
    qq: string,
    nick: string,
    group: string,
    groupName: string,
    content: string,
    anonymous: boolean,
    timeStamp: number | undefined
}
export const throwBottle = (ctx: Context, bottle: Bottle) => {
    return ctx.http.axios(baseUrl + 'throw', {
        method: 'POST',
        data: bottle
    })
}

export const pickBottle = async (ctx: Context, id: number | undefined): Promise<Bottle> => {
    return await ctx.http.axios(baseUrl + 'pick', {
        method: 'GET',
        params: {
            id: id
        }
    }).then(res => {
        if (res.data.succ) {
            return res.data.data
        } else {
            console.error(res.data.errMsg)
            return null
        }
    }).catch(err => {
        console.error(err)
        return null
    })
}

export const deleteBottle = (ctx: Context, id: number, qq: string) => {
    return ctx.http.axios(baseUrl + 'deleteBottle', {
        method: 'DELETE',
        data: {
            id: id,
            qq: qq
        }
    })
}

type Comment = {
    bottleId: number,
    qq: string,
    nick: string,
    content: string,
    anonymous: boolean
}
export const getComment = (ctx: Context, id: number) => {
    return ctx.http.axios(baseUrl + 'getComment', {
        method: 'GET',
        params: {
            id: id
        }
    })
}

export const comment = (ctx: Context, comment: Comment) => {
    return ctx.http.axios(baseUrl + 'comment', {
        method: 'POST',
        data: comment
    })
}

export const deleteComment = (ctx: Context, id: number, qq: string) => {
    return ctx.http.axios(baseUrl + 'deleteComment', {
        method: 'DELETE',
        data: {
            id: id,
            qq: qq
        }
    })
}

type BottleThumbs = {
    qq: string,
    id: number,
    thumbsUp: boolean
}
export const getThumbs = (ctx: Context, id: number) => {
    return ctx.http.axios(baseUrl + 'getThumbs', {
        method: 'GET',
        params: {
            id: id
        }
    })
}

export const giveThumbs = (ctx: Context, bottleThumbs: BottleThumbs) => {
    return ctx.http.axios(baseUrl + 'giveThumbs', {
        method: 'POST',
        data: bottleThumbs
    })
}

export const collect = (ctx: Context, id: number, qq: string) => {
    return ctx.http.axios(baseUrl + 'collect', {
        method: 'POST',
        data: {
            id: id,
            qq: qq
        }
    })
}

export const deleteCollect = (ctx: Context, id: number, qq: string) => {
    return ctx.http.axios(baseUrl + 'deleteCollect', {
        method: 'DELETE',
        data: {
            id: id,
            qq: qq
        }
    })
}

export const getCollect = (ctx: Context, qq: string) => {
    return ctx.http.axios(baseUrl + 'searchBottleByCollect', {
        method: 'GET',
        params: {
            qq: qq
        }
    })
}