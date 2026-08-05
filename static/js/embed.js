layui.use(['upload','form','element','layer','flow'], function(){
		var upload = layui.upload;
        var form = layui.form;
        var element = layui.element;
        var layer   = layui.layer;
        
		//图片懒加载
		var flow = layui.flow;
		flow.lazyimg({
            elem:'#found img'
        });
        //图片查看器
        layer.photos({
            photos: '#found'
            ,anim: 5 //0-6的选择，指定弹出图片动画类型，默认随机（请注意，3.0之前的版本用shift参数）
        });
        layer.photos({
            photos: '#lightgallery'
            ,anim: 5 //0-6的选择，指定弹出图片动画类型，默认随机（请注意，3.0之前的版本用shift参数）
        });
        
		//执行实例
		var uploadInst = upload.render({
            elem: '#upimg' //绑定元素
            ,url: '/up'        // Pages Function 上传接口（替代原 up.php）
            ,field: 'file'     // 后端接收的字段名
            ,data: {
                token: function(){ return $('#access-token').val() || ''; },
                useR2: function(){ return ($('#use-r2').prop('checked') ? 'true' : 'false'); },
                storage: function(){ return $('#storage-type').val() || 'github'; },
                cdn: function(){ return $('#cdn-line').val() || 'jsdelivr'; }
            }
            ,choose: function(obj){ //obj参数包含的信息，跟 choose回调完全一致，可参见上文。
                $(".progress").hide();
            }
            ,accept:'file'
            ,acceptMime:'image/jpeg,image/pjpeg,image/png,image/x-png,image/gif'
            ,exts: 'jpg|jpeg|png|gif'
            ,size:20480
            ,before: function(obj){ //obj参数包含的信息，跟 choose回调完全一致，可参见上文。
                layer.load(); //上传loading
            }
			,done: function(res){
                //console.log(res);
                //上传完毕回调
                //如果上传失败
                handleres(res);
			}
			,error: function(){
                //请求异常回调
                layer.closeAll('loading');
			}
        });
        //单文件上传END

        // 存储平台切换：Gitee 时隐藏 CDN 线路（Gitee 无多线路）
        form.on('select(storage-type)', function(data){
            if(data.value === 'gitee'){
                $('#cdn-line-wrap').hide();
            } else {
                $('#cdn-line-wrap').show();
            }
        });
        // 初始化时也触发一次
        if($('#storage-type').val() === 'gitee'){
            $('#cdn-line-wrap').hide();
        }

});
function handleres(res){
    layui.use('layer', function(){
        var layer = layui.layer;
        if(res.code != 'success'){
            layer.open({
                title: '温馨提示'
                ,content: res.msg
            });  
            layer.closeAll('loading');
            
        }
        else{
            layer.closeAll('loading'); 
            $("#img-thumb a").attr('href',res.data.url);
            $("#img-thumb img").attr('src',res.data.url);
            $("#url").val(res.data.url);
            $("#markdown").val("![](" + res.data.url + ")");
            $("#bbcode").val("[img]" + res.data.url + "[/img]");
            if(res.data.r2url){
                $("#r2url").val(res.data.r2url);
                $("#r2row").show();
            } else {
                $("#r2row").hide();
            }
            $("#imgshow").show();
            
        }


    }); 

}

//复制链接
//复制链接
function copyurl(info){
    var copy = new clipBoard(document.getElementById('links'), {
        beforeCopy: function() {
            info = $("#" + info).val();
        },
        copy: function() {
            return info;
        },
        afterCopy: function() {

        }
    });
    layui.use('layer', function(){
          var layer = layui.layer;
          layer.msg('链接已复制！', {time: 2000,icon:1})
    }); 
}


//显示图片链接
function showlink(url){
    layer.open({
        type: 1,
        title: false,
        content: $('#imglink'),
        area: ['680px', '500px']
    });
    $("#url").val(url);
    $("#markdown").val("![](" + url + ")");
    $("#bbcode").val("[img]" + url + "[/img]");
    $("#imglink").show();
}


document.addEventListener('paste', function (event) {
    var isChrome = false;
    if ( event.clipboardData || event.originalEvent ) {
        var clipboardData = (event.clipboardData || event.originalEvent.clipboardData);
        if ( clipboardData.items ) {
            // for chrome
            var  items = clipboardData.items,
                len = items.length,
                blob = null;
            isChrome = true;

            event.preventDefault();

            let images = [];
            for (var i = 0; i < len; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    blob = items[i].getAsFile();
                    images.push(blob);
                }
            }
            if(images.length > 0) {
                layer.confirm('是否上传粘贴板文件？', function(index){
                    layer.load();
                    var formData = new FormData();
                    formData.append('file', images[0]);
                    formData.append('token', $('#access-token').val() || '');
                    formData.append('useR2', ($('#use-r2').prop('checked') ? 'true' : 'false'));
                    formData.append('storage', $('#storage-type').val() || 'github');
                    formData.append('cdn', $('#cdn-line').val() || 'jsdelivr');
                    $.ajax({
                        url: '/up',
                        data: formData,
                        type: 'post',
                        processData: false,
                        contentType: false,
                        dataType: 'json',
                        success: function (data) {
                            
                            handleres(data);
                        },
                        error: function (xOptions, textStatus) {
                            layer.closeAll('loading');
                            layer.msg('上传失败，请重试', {time: 2000, icon:2});
                        }
                        
                    });
                  layer.close(index);
                });  
                // layer.confirm('', {
                //   btn: ['立马上传', '按错了'] //可以无限个按钮
                // }, function(index, layero){

                  

                // }, function(index){
                //   console.log("取消上传");
                // });
                //layer.close(layer.index);
            }
        } else {
            //for firefox
        }
    } else {
    }
});