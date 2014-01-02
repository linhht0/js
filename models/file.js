var NoteFile = Protected.extend({
	base_url: '/files',

	public_fields: [
		'hash',
		'size',
		'upload_id'
	],

	private_fields: [
		'name',
		'type'
	],

	find_key: function()
	{
		var note	=	this && this.get_parent && this.get_parent();
		if(note)
		{
			this.key	=	note.key;
			return this.key;
		}
		return this.parent.apply(this, arguments);
	},

	to_array: function(options)
	{
		options || (options = {});

		if(!this.get('hash')) return false;

		turtl.db.files.get(this.get('hash'))
			.done(function(filedata) {
				if(!filedata)
				{
					if(options.error) options.error(false);
					return false;
				}
				var file	=	new FileData();
				file.key	=	this.key;
				file.set(filedata, {
					async_success: function() {
						var data	=	file.get('data');
						var buffer	=	new ArrayBuffer(data.length);
						var array	=	new Uint8Array(buffer);
						for(var i = 0, n = data.length; i < n; i++)
						{
							array[i]	=	data.charCodeAt(i);
						}
						if(options.success) options.success(array);
					}.bind(this)
				});
			}.bind(this))
			.fail(function(e) {
				if(options.error) options.error(e);
			})
	},

	to_blob: function(options)
	{
		options || (options = {});

		return this.to_array({
			success: function(array) {
				if(options.success) options.success(new Blob([array.buffer], {type: this.get('type')}))
			}.bind(this),
			error: options.error
		});
	}
});

var FileData = ProtectedThreaded.extend({
	base_url: '/files',

	public_fields: [
		'id',
		'note_id'
	],

	private_fields: [
		'data'
	],

	save: function(options)
	{
		options || (options = {});

		if(options.api_save)
		{
			var data	=	this.toJSON();
			var body	=	data.body;
			var data	=	{
				hash: data.id,
				cid: this.cid()
			};

			// convert body to Uint8Array
			// TODO: always store file body as Uint8Array in local db...
			var raw	=	new Uint8Array(body.length);
			for(var i = 0, n = body.length; i < n; i++)
			{
				raw[i]	=	body.charCodeAt(i);
			}

			// mark the save as raw and fire it off
			options.raw		=	true;
			options.data	=	raw;
			options.args	=	data;
			this.url		=	'/notes/'+this.get('note_id')+'/file';
			options.uploadprogress	=	function(ev) {
				console.log('progress: ', ev);
			};
			return this.parent.apply(this, arguments);
		}
		else
		{
			return this.parent.apply(this, arguments);
		}
	}
});

var Files = SyncCollection.extend({
	model: FileData,
	local_table: 'files',

	update_record_from_api_save: function(modeldata, record, options)
	{
		options || (options = {});

		if(_sync_debug_list.contains(this.local_table))
		{
			console.log('save: '+ this.local_table +': api -> db ', modeldata);
		}

		// note that we don't need all the cid renaming heeby jeeby here since
		// we already have an id (the hash) AND the object we're attaching to
		// (teh note) must always have an id before uploading. so instead, we're
		// going to update the model data into the note's [file] object.
		var note_id	=	modeldata.note_id;
		var hash	=	modeldata.id;
		turtl.db.files
			.query()
			.filter('id', hash)
			.modify({synced: true})
			.execute()
			.done(function() {
				turtl.db.notes
					.query()
					.filter('id', note_id)
					.modify({last_mod: new Date().getTime()})
					.execute()
					.done(function() {
						if(options.success) options.success();
					})
					.fail(function(e) {
						console.error('file: error setting note.last_mod', e);
						if(options.error) options.error(e);
					});
			})
			.fail(function(e) {
				console.error('file: error setting file.synced = true', e);
				if(options.error) options.error(e);
			});

	}
});