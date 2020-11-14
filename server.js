const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const Sequelize = require('sequelize');
const helmet = require('helmet');
const app = express();
const allowedReferer = 'https://pwa.portfolio-s.info';

// セキュリティ 
app.use(helmet());

// CORSを許可する
app.use(function(req, res, next) {
	res.header('Access-Control-Allow-Origin', allowedReferer);
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	next();
});

// urlencodedとjsonは別々に初期化する
app.use(bodyParser.urlencoded({
	extended: true
}));
app.use(bodyParser.json());

// DBに接続
const sequelize = new Sequelize(process.env.DATABASE_URL, {
	logging: false,
	operatorsAliases: false
})

// テーブルを作成
const subscriptions = sequelize.define('subscriptions', {
	id: {
		type: Sequelize.INTEGER,
		autoIncrement: true,
		primaryKey: true
	},
	registrationID: {
		type: Sequelize.STRING,
		allowNull: false
	},
	publicKey: {
		type: Sequelize.STRING,
		allowNull: false
	},
	auth: {
		type: Sequelize.STRING,
		allowNull: false
	},
	endpoint: {
		type: Sequelize.STRING,
		allowNull: false
	},
	deleted: {
		type: Sequelize.BOOLEAN,
		allowNull: false,
		defaultValue: false
	}
}, {
	freezeTableName: true,
	timestamps: true,
	indexes: [{
		unique: false,
		fields: ['deleted']
	}]
});

subscriptions.sync();

// ルートにアクセスされたら文字列を表示
app.get('/', function(req, res) {
	res.setHeader('Content-Type', 'text/plain');
	res.send('This is PWA App');
});

// addでアクセスされたらサブスクリプションをDBに追加する
app.post('/add', function(req, res) {
	if (req.headers['x-forwarded-proto'] === 'http' || req.headers['referer'].indexOf(allowedReferer) === -1 ){
		res.status(500).send('Referer is not allowed.');
	} else {
		let data = req.body;
		let response = res;
		subscriptions.create({
			registrationID: data.registrationID,
			publicKey: data.key,
			auth: data.auth,
			endpoint: data.endpoint
		}).then(function() {
			response.setHeader('Content-Type', 'text/plain');
			response.end('New subscription is successfully added.');
		});
	}
});

// deleteでアクセスされたら古いサブスクリプションの削除フラグをtrueにする
app.post('/delete', function(req, res) {
	if (req.headers['x-forwarded-proto'] === 'http' || req.headers['referer'].indexOf(allowedReferer) === -1 ) {
		res.status(500).send('Referer is not allowed.');
	} else {
		let data = req.body;
		let response = res;
		subscriptions.update({
			deleted: true
		}, {
			where: {
				registrationID: data.registrationID
			}
		}).then(function(err) {
			response.setHeader('Content-Type', 'text/plain');
			response.end('Old subscription is successfully deleted.');
		}).catch(function(err) {
			console.log('ERROR', err);
		});
	}
});

// pushでアクセスされたら削除フラグがfalseのものに対して通知を送る
app.post('/push', function(req, res) {
	if (req.headers['x-forwarded-proto'] === 'http' || req.headers['referer'].indexOf(allowedReferer) === -1 ) {
		res.status(500);
		res.end('Referer is not allowed.');
	} else {
		let response = res;
		let data = req.body;
		let subscribers = [];

		// 通知の内容
		const params = {
			title: data.title,
			msg: data.message,
			icon: 'https://pwa.portfolio-s.info/icon/launcher-icon-512x512.png'
		};

		webpush.setVapidDetails(
			'mailto:shingo.horie.mobile@gmail.com',
			'BFibl7x-mj9rAcmMKlkiR78Gc0H9AhT87GscGWy3Lbt_rc-khCwMx2TdSY1b0tbHIiyzNUenqM9mD-uF5unl_ro',
			'VJDN0xh7iQr2ZBONwPYwQRVSh-ASXO03JRFuiMsGLVc'
		);

		subscriptions.findAll({
			where: {
				deleted: false
			}
		}).then(function(rows) {
			// 利用可能なサブスクリプションを配列に追加
			rows.forEach(function(row) {
				let subscription = {};
				subscription.endpoint = row.endpoint;
				subscription.expirationTime = null;
				subscription.keys = {
					p256dh: row.publicKey,
					auth: row.auth
				};
				subscribers.push(subscription);
			});
			Promise.all(subscribers.map(function(subscription) {
					return webpush.sendNotification(subscription, JSON.stringify(params), {});
				}))
				.then(function(res) {
					response.setHeader('Content-Type', 'text/plain');
					response.end('Request data is successfully pushed.');
				})
				.catch(function(err) {
					console.log('ERROR', err);
				});
		});
	}
});


// サーバ起動
const server = app.listen(process.env.PORT || 8000);
