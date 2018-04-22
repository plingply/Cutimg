window.onload = function () {
	var maximumTriangleCount = 200;
	var maxAllowableBadness = 1e-2;

	// The control points which represent the top-left, top-right and bottom
	// right of the image.
	var controlPoints = [
		{ x: 65, y: 225 },
		{ x: 369, y: 69 },
		{ x: 682, y: 637 },
		{ x: 403, y: 790 }
	];

	document.querySelectorAll('.inputele').forEach(function (item, index) {
		item.value = controlPoints[index].x + '/' + controlPoints[index].y
	})

	var backgroundImgElement = document.getElementById('background');
	var imgElement = document.getElementById('screen');
	var canvasElement = document.getElementById('canvasElement');
	var svgElement = document.getElementById('svgElement');
	var drawSkeletonElement = document.getElementById('drawSkeleton');
	var containerElement = document.getElementById('container')

	initialize();

	function initialize() {
		drawSkeletonElement.onchange = redrawImg;
		imgElement.onload = redrawImg;
		backgroundImgElement.onload = resizeElements;

		resizeElements();
		setupDragging();
		redrawImg();
	}

	function resizeElements() {
		var w = backgroundImgElement.naturalWidth;
		var h = backgroundImgElement.naturalHeight;
		containerElement.style.width = w + 'px';
		containerElement.style.height = h + 'px';
		svgElement.style.width = w + 'px'; svgElement.style.height = h + 'px';
		canvasElement.width = w; canvasElement.height = h;
		redrawImg();
	}

	function redrawImg() {
		var drawSkeleton = !!(drawSkeletonElement.checked);

		var w = imgElement.naturalWidth, h = imgElement.naturalHeight;

		var srcPoints = [
			{ x: 0, y: 0 },    // top-left
			{ x: w, y: 0 },    // top-right
			{ x: w, y: h },    // bottom-right
			{ x: 0, y: h }     // bottom-left
		];

		var ctx = canvasElement.getContext('2d');
		ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

		var projPoints = findQuadProjectiveDepths(controlPoints);

		var triangles = [
			{
				src: [srcPoints[0], srcPoints[1], srcPoints[2]],
				dst: [projPoints[0], projPoints[1], projPoints[2]]
			},
			{
				src: [srcPoints[2], srcPoints[3], srcPoints[0]],
				dst: [projPoints[2], projPoints[3], projPoints[0]]
			}
		];

		// Keep sub-dividing until we're done
		var triIdx = 0;
		while ((triIdx < triangles.length) && (triangles.length < maximumTriangleCount)) {
			var newTris = subdivideTriangle(triangles[triIdx]);
			if (newTris.length == 1) {
				// no subdivision performed
				triIdx++;
			} else {
				// remove original triangle and add new ones
				triangles.splice(triIdx, 1);
				triangles = triangles.concat(newTris);
			}
		}

		// Draw affine-transformed triangles
		for (var i = 0; i < triangles.length; i++) {
			var src = triangles[i].src;
			var dstProj = triangles[i].dst;

			var dst = [];
			for (var j = 0; j < dstProj.length; j++) {
				var p = dstProj[j];
				dst.push({ x: p.x / p.z, y: p.y / p.z });
			}

			var T = affineTransformationFromTriangleCorners(src, dst);

			ctx.save();

			// set clip
			trianglePath(ctx, dst);
			ctx.clip();
			

			// draw image
			ctx.transform(T[0], T[1], T[2], T[3], T[4], T[5]);

			ctx.drawImage(imgElement, 0, 0);

			ctx.restore();


			
		}

		if (drawSkeleton) {
			svgElement.style.visibility = 'visible';
		} else {
			svgElement.style.visibility = 'hidden';
		}
	}

	function subdivideTriangle(inputTri) {
		// Work out badness of each edge
		var worstEdge = { badness: -1, corners: null };
		for (var cornerIdx = 0; cornerIdx < inputTri.dst.length; cornerIdx++) {
			var corner1Idx = cornerIdx, corner2Idx = (cornerIdx + 1) % inputTri.dst.length;
			var dz = inputTri.dst[corner1Idx].z - inputTri.dst[corner2Idx].z;
			var badness = Math.abs(dz);
			if (badness > worstEdge.badness) {
				worstEdge = { badness: badness, corners: [corner1Idx, corner2Idx] };
			}
		}

		// If the maximum badness is OK, don't subdivide
		if (worstEdge.badness < maxAllowableBadness) {
			return [inputTri];
		}

		// Going to turn
		//                       
		// A _____ B      A __D__ B
		//   \   /          \/_\/
		//    \ /     =>   F \ / E
		//     C              C

		var srcA = inputTri.src[0], dstA = inputTri.dst[0];
		var srcB = inputTri.src[1], dstB = inputTri.dst[1];
		var srcC = inputTri.src[2], dstC = inputTri.dst[2];

		var srcD = { x: (srcA.x + srcB.x) / 2, y: (srcA.y + srcB.y) / 2 };
		var dstD =
			{ x: (dstA.x + dstB.x) / 2, y: (dstA.y + dstB.y) / 2, z: (dstA.z + dstB.z) / 2 };
		var srcE = { x: (srcB.x + srcC.x) / 2, y: (srcB.y + srcC.y) / 2 };
		var dstE =
			{ x: (dstB.x + dstC.x) / 2, y: (dstB.y + dstC.y) / 2, z: (dstB.z + dstC.z) / 2 };
		var srcF = { x: (srcC.x + srcA.x) / 2, y: (srcC.y + srcA.y) / 2 };
		var dstF =
			{ x: (dstC.x + dstA.x) / 2, y: (dstC.y + dstA.y) / 2, z: (dstC.z + dstA.z) / 2 };

		return [
			{ src: [srcA, srcD, srcF], dst: [dstA, dstD, dstF] },
			{ src: [srcD, srcB, srcE], dst: [dstD, dstB, dstE] },
			{ src: [srcC, srcF, srcE], dst: [dstC, dstF, dstE] },
			{ src: [srcD, srcE, srcF], dst: [dstD, dstE, dstF] },
		]
	}

	function findQuadProjectiveDepths(corners) {
		// See http://www.reedbeta.com/blog/2012/05/26/quadrilateral-interpolation-part-1/

		// Firstly, find the centre point:
		var centre = intersectLines(
			[corners[0], corners[2]], [corners[1], corners[3]]);

		// Lengths of diagonals
		var d02 = dist(corners[0], corners[2]);
		var d13 = dist(corners[1], corners[3]);

		// Find a projective homogeneous representation for each corner point
		// with the correct projective co-ordinate. See the site referenced in
		// the top comment for some more details.

		var tl_z = d02 / dist(corners[0], centre);
		var tl_hom = { x: tl_z * corners[0].x, y: tl_z * corners[0].y, z: tl_z };

		var tr_z = d13 / dist(corners[1], centre);
		var tr_hom = { x: tr_z * corners[1].x, y: tr_z * corners[1].y, z: tr_z };

		var br_z = d02 / dist(corners[2], centre);
		var br_hom = { x: br_z * corners[2].x, y: br_z * corners[2].y, z: br_z };

		var bl_z = d13 / dist(corners[3], centre);
		var bl_hom = { x: bl_z * corners[3].x, y: bl_z * corners[3].y, z: bl_z };

		return [tl_hom, tr_hom, br_hom, bl_hom];
	}

	function trianglePath(ctx, points) {
		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);
		ctx.lineTo(points[1].x, points[1].y);
		ctx.lineTo(points[2].x, points[2].y);
		ctx.closePath();
	}

	function setupDragging() {
		// Use d3.js to provide user-draggable control points
		var rectDragBehav = d3.behavior.drag().on('drag', rectDragDrag);

		var dragT = d3.select(svgElement).selectAll('circle')
			.data(controlPoints)
			.enter().append('circle')
			.attr('cx', function (d) { return d.x; })
			.attr('cy', function (d) { return d.y; })
			.attr('r', 20)
			.attr('class', 'control-point')
			.attr('data-id', function (data, index) {
				return 'id' + index
			})
			.call(rectDragBehav);

		function rectDragDrag(d, i) {
			d.x += d3.event.dx; d.y += d3.event.dy;
			d3.select(this).attr('cx', d.x).attr('cy', d.y);

			// 当拖动点的时候 获取坐标
			setInputValue(this, d)
			redrawImg();
		}
	}



	function affineTransformationFromTriangleCorners(before, after) {
		/*
		 Return the a, b, c, d, e, f parameters needed by the transform() 
		 canvas function which will transform the three points in *before* to the
		 corresponding ones in *after*. The points should be specified as
		 [{x:x1,y:y1}, {x:x2,y:y2}, {x:x3,y:y2}].
		*/

		/*
		 Calling the before points [x1, y1], etc and the after points [x1',
		 y1'], etc, then the affine transformation matrix must do this:
	
			[ x1' x2' x3' ]   [ a c e ] [ x1 x2 x3 ]
			[ y1' y2' y3' ] = [ b d f ] [ y1 y2 y3 ]
			[ 1   1   1   ]   [ 0 0 1 ] [ 1  1  1  ]
	
			`-------------'   `-------' `----------'
				   Y        =     T          X
	
		 We know matrices Y and X because we're passed them. We want T. So,
		 
			 T = Y * inverse(X).
		*/

		var X, Y, T;

		// Make X matrix
		X = [
			[before[0].x, before[1].x, before[2].x],
			[before[0].y, before[1].y, before[2].y],
			[1, 1, 1]
		];

		// Make Y matrix
		Y = [
			[after[0].x, after[1].x, after[2].x],
			[after[0].y, after[1].y, after[2].y],
			[1, 1, 1]
		];

		// Compute T matrix using Numeric. If you wanted, you could work out the
		// inverse of X long-hand but life is too short.
		T = numeric.dot(Y, numeric.inv(X));

		// We only want specific elements from T
		return [T[0][0], T[1][0], T[0][1], T[1][1], T[0][2], T[1][2]];
	}

	function intersectLines(line1, line2) {
		/*
			Return an object of the form {x: ..., y: ...} which specifies the
			intersection of the two lines specified as an array of two points.
		*/

		// See http://en.wikipedia.org/wiki/Line-line_intersection

		var x1, y1, x2, y2, x3, y3, x4, y4;

		x1 = line1[0].x; y1 = line1[0].y;
		x2 = line1[1].x; y2 = line1[1].y;
		x3 = line2[0].x; y3 = line2[0].y;
		x4 = line2[1].x; y4 = line2[1].y;

		var denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

		return {
			x: ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator,
			y: ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator
		};
	}

	// Utility function to compute distance between points
	function dist(a, b) {
		var dx = a.x - b.x;
		var dy = a.y - b.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	// 给input赋值
	function setInputValue(self, d) {
		var id = d3.select(self).attr('data-id')
		document.querySelectorAll('.inputele').forEach(function (item) {
			if (id == item.id) {
				item.value = d.x + '/' + d.y
			}
		})
	}

	// 合成图片
	document.getElementById("hecheng").onclick = function () {
		var box = document.querySelector('.imgyulan')
		box.innerHTML = ''
		var width = canvasElement.width
		var height = canvasElement.height
		var canvas = document.createElement('canvas')
		canvas.id = 'downloadimgcanvas'
		var ctx = canvas.getContext('2d');
		canvas.width = width
		canvas.height = height
		var src1 = canvasElement.toDataURL("image/png");
		var img1 = new Image()
		img1.src = src1
		var img2 = document.getElementById('background')
		img1.onload = function () {
			ctx.drawImage(img1, 0, 0, width, height)
			ctx.drawImage(img2, 0, 0, width, height)
			box.appendChild(canvas)
		}
	}

	// 下载图片
	document.getElementById('dowmimg').onclick = function () {
		var canvas = document.getElementById('downloadimgcanvas')

		if (!canvas) {
			return alert("请先合成图片")
		}

		//cavas 保存图片到本地  js 实现
		//------------------------------------------------------------------------
		//1.确定图片的类型  获取到的图片格式 data:image/Png;base64,......
		var type = 'png';//你想要什么图片格式 就选什么吧
		var imgdata = canvas.toDataURL(type);
		//2.0 将mime-type改为image/octet-stream,强制让浏览器下载
		var fixtype = function (type) {
			type = type.toLocaleLowerCase().replace(/jpg/i, 'jpeg');
			var r = type.match(/png|jpeg|bmp|gif/)[0];
			return 'image/' + r;
		};
		imgdata = imgdata.replace(fixtype(type), 'image/octet-stream');
		//3.0 将图片保存到本地
		var savaFile = function (data, filename) {
			var save_link = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');
			save_link.href = data;
			save_link.download = filename;
			var event = document.createEvent('MouseEvents');
			event.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
			save_link.dispatchEvent(event);
		};
		var filename = '' + new Date().getTime() / 1000 + '.' + type;
		//我想用当前秒是可以解决重名的问题了 不行你就换成毫秒
		savaFile(imgdata, filename);
	}

	//上传图片
	document.getElementById("upload").onclick = function () {
		var canvas = document.getElementById('downloadimgcanvas')

		if (!canvas) {
			return alert("请先合成图片")
		}
		var type = 'png';//你想要什么图片格式 就选什么吧
		var imgdata = canvas.toDataURL(type);
		console.log(imgdata)
		alert('自行上传至服务器')
	}


}