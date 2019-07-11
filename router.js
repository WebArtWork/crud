module.exports = function(sd) {
	/*
	*	Crud Fill
	*/
		var fill_crud = function(part, which, config){
			var prefix = which+'_'+part+(config.name&&('_'+config.name)||'');
			if(typeof config.ensure == 'function'){
				sd['ensure_'+prefix] = config.ensure;
			}
			if(typeof config.query == 'function'){
				sd['query_'+prefix] = config.query;
			}
			if(typeof config.sort == 'function'){
				sd['sort_'+prefix] = config.sort;
			}
			if(typeof config.skip == 'function'){
				sd['skip_'+prefix] = config.skip;
			}
			if(typeof config.limit == 'function'){
				sd['limit_'+prefix] = config.limit;
			}
			if(typeof config.select == 'function'){
				sd['select_'+prefix] = config.select;
			}
			if(typeof config.populate == 'function'){
				sd['populate_'+prefix] = config.populate;
			}
		}
		var crudTypes = ['create', 'get', 'update', 'delete'];
		sd.crud = function(part, config){
			for (var i = 0; i < crudTypes.length; i++) {
				if(Array.isArray(config[crudTypes[i]])){
					for (var i = 0; i < config[crudTypes[i]].length; i++) {
						if(typeof config[crudTypes[i]][i] != 'object') continue;
						fill_crud(part, crudTypes[i], config[crudTypes[i]][i]);
					}
				}else if(typeof config[crudTypes[i]] == 'object'){
					fill_crud(part, crudTypes[i], config[crudTypes[i]]);
				}
			}
		};
	/*
	*	Crud Use
	*/
		var add_crud = function(crud, part, unique=true){
			var partName = part.name.toLowerCase();
			var crudName = crud.name.toLowerCase();
			var Schema = process.cwd() + '/server/' + partName + '/schema_' + crudName+ '.js';
			if(unique) Schema = process.cwd() + '/server/' + partName + '/schema.js';
			if (!sd.fs.existsSync(Schema)) {
				var data = sd.fs.readFileSync(__dirname+'/schema.js', 'utf8');
				data = data.replace('REPLACE', sd.capitalize(crudName));
				sd.fs.writeFileSync(Schema, data, 'utf8');
			}
			Schema = require(Schema);
			var router = sd.router('/api/'+crudName);
			var save = function(doc, res){
				doc.save(function(err){
					if(err){
						console.log(err);
						return res.json(false);
					}
					res.json(doc);
				});
			}
			/*
			*	Create
			*/
				router.post("/create", sd['ensure_create_'+crudName]||sd.ensure, function(req, res) {
					var doc = new Schema();
					if(typeof doc.create !== 'function'){
						return res.json(false);
					}
					doc.create(req.body, req.user, sd);
					save(doc, res);
				});
			/*
			*	Read
			*/
				var get_unique = {};
				var crud_get = function(name){
					if(get_unique[name]) return;
					get_unique[name] = true;
					var final_name = '_get_'+crudName;
					if(name) final_name += '_'+name;
					router.get("/get"+name, sd['ensure'+final_name]||sd.next, function(req, res) {
						var query = sd['query'+final_name]&&sd['query'+final_name](req, res)||{
							moderators: req.user&&req.user._id
						};
						query = Schema.find(query);
						var sort = sd['sort'+final_name]&&sd['sort'+final_name](req, res)||false;
						if(sort){
							query.sort(sort);
						}
						var skip = sd['skip'+final_name]&&sd['skip'+final_name](req, res)||false;
						if(skip){
							query.skip(skip);
						}
						var limit = sd['limit'+final_name]&&sd['limit'+final_name](req, res)||false;
						if(limit){
							query.limit(limit);
						}
						var select = sd['select'+final_name]&&sd['select'+final_name](req, res)||false;
						if(select){
							query.select(select);
						}
						var populate = sd['populate'+final_name]&&sd['populate'+final_name](req, res)||false;
						if(populate){
							query.populate(populate);
						}
						query.exec(function(err, docs) {
							if(err){
								console.log(err);
							}
							res.json(docs || []);
						});
					});
				}
				if(Array.isArray(crud.get)){
					for (var i = 0; i < crud.get.length; i++) {
						crud_get(crud.get[i]);
					}
				}else if(typeof crud.get == 'string') crud_get(crud.get[i]);
				else crud_get('');
			/*
			*	Update
			*/
				var crud_update = function(upd){
					let final_name = '_update_'+crudName;
					if(upd.name) final_name += '_'+upd.name;
					router.post("/update"+(upd.name||''), sd['ensure'+final_name]||sd.ensure, function(req, res) {
						Schema.findOne(sd['query'+final_name]&&sd['query'+final_name](req, res)||{
							_id: req.body._id,
							moderators: req.user&&req.user._id
						}, function(err, doc){
							if(err||!doc){
								err&&console.log(err);
								return res.json(false);
							}
							for (var i = 0; i < upd.keys.length; i++) {
								doc[upd.keys[i]] = req.body[upd.keys[i]];
								doc.markModified(upd.keys[i]);
							}
							save(doc, res);
						});
					});
				}
				if(Array.isArray(crud.update)){
					for (var i = 0; i < crud.update.length; i++) {
						crud_update(crud.update[i]);
					}
				}else if(typeof crud.update == 'object') crud_update(crud.update);
			/*  
			*	Delete
			*/
				var crud_delete = function(name){
					let final_name = '_delete_'+crudName;
					if(name) final_name += '_'+name;
					router.post("/delete"+name, sd['ensure' + final_name] || sd.ensure, function(req, res) {
						let q = Schema.findOne(sd['query' + final_name] && sd['query' + final_name](req, res) || {
							_id: req.body._id,
							author: req.user._id
						})
						let populate = sd['populate'+final_name]&&sd['populate'+final_name](req, res)||false;
						if(populate){
							q.populate(populate);
						}
						q.exec(function(err, doc) {
							if(err||!doc) return res.json(false);
							Schema.remove(sd['query' + final_name] && sd['query' + final_name](req, res) || {
								_id: req.body._id,
								author: req.user._id
							}, function(err) {
								if (err){
									console.log(err);
									res.json(false);
								}else{
									if(typeof sd['on'+name] == 'function'){
										sd['on'+name](doc, req, res);
									}
									res.json(true);
								}
							});
						});
					});
				}
				if(crud.delete){
					for (var i = 0; i < crud.delete.length; i++) {
						crud.delete[i]&&crud_delete(crud.delete[i]);
					}
				}
			/*
			*	End of CRUD
			*/
		}
		for (var i = 0; i < sd.parts.length; i++) {
			if(sd.parts[i].crud){
				if(Array.isArray(sd.parts[i].crud)){
					for (var j = 0; j < sd.parts[i].crud.length; j++) {
						add_crud(sd.parts[i].crud[j], sd.parts[i], false);
					}
				}else{
					if(!sd.parts[i].crud.name){
						sd.parts[i].crud.name = sd.parts[i].name
					}
					add_crud(sd.parts[i].crud, sd.parts[i]);
				}
			}
		}
	/*
	*	Support for 0.x version of waw until 2.0
	*/
};