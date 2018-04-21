//本地web服务
var express = require('express');
var app = express();
var path = require('path');
var port = 8091

//指定静态资源访问目录
app.use(express.static(require('path').join(__dirname, 'dist')));
// app.use(express.static(require('path').join(__dirname, 'views'))); 如果有文件夹存放资源，出现报错的话，那就多use几次就可以了
// 设定views变量，意为视图存放的目录
app.set('views', (__dirname + "/dist"));
// app.set('views', __dirname);
// 修改模板文件的后缀名为html
app.set('view engine', 'html');
// 运行ejs模块
app.engine('.html', require('ejs').__express);

app.get("/", function(req, res, next) {
    res.render('index');
    next()
});

app.get('*', function(req, res) {
    res.end('404 not found')
})

var server = app.listen(port, "127.0.0.1", function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log("Server running at http://%s:%s", host, port)
});