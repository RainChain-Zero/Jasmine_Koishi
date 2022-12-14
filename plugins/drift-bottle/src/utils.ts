import { segment, Session } from "koishi"

export const buildForwardMessage = (session: Session<never, never>, res: any) => {
    const attrs = {
        userId: session.userId,
        nickname: session.author?.nickname || session.username,
    }
    const result = segment('figure')
    let resStr = ''
    for (let i = 0; i < res.data.data.length; i++) {
        //略缩展示
        let content = res.data.data[i].content.replace(/\[\[.*\]\]/g, '[图片]')
        content = content.length > 20 ? content.slice(0, 30) + '...' : content
        resStr += `【${res.data.data[i].id}】\n${content}\n`
        //每20条一个消息段
        if (i % 20 === 19 || i === res.data.data.length - 1) {
            result.children.push(segment('message', attrs, resStr))
            resStr = ''
        }
    }
    return result.children.length ? result : '茉莉没有找到相应的瓶子哦~'
}