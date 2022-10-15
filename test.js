const WebSocket = require('ws');
var ws = new WebSocket("ws://127.0.0.1:6701");

//连接成功时，触发事件

ws.onopen = function () {
    var json = {
        "action": "_send_group_notice",
        "params": {
            "group_id":436159372,
            "content":"测试"
        }
    }
    ws.send(JSON.stringify(json));
}

ws.onmessage = function (data) {
    console.log('接收到来自服务器的消息：');
    console.log(data);
    //完成通信后关闭WebSocket连接
    ws.close();
}

ws.close()