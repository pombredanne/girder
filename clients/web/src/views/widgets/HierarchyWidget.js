/**
 * This widget is used to navigate the data hierarchy of folders and items.
 */
girder.views.HierarchyWidget = girder.View.extend({
    events: {
        'click a.g-create-subfolder': 'createFolderDialog',
        'click a.g-edit-folder': 'editFolderDialog',
        'click a.g-download-folder': 'downloadFolder',
        'click a.g-delete-folder': 'deleteFolderDialog',
        'click a.g-create-item': 'createItemDialog',
        'click .g-upload-here-button': 'uploadDialog',
        'click .g-folder-access-button': 'editFolderAccess',
        'click .g-hierarchy-level-up': 'upOneLevel',
        'click a.g-download-checked': 'downloadChecked',
        'click a.g-pick-checked': 'pickChecked',
        'click a.g-move-picked': 'movePickedResources',
        'click a.g-copy-picked': 'copyPickedResources',
        'click a.g-clear-picked': 'clearPickedResources',
        'click a.g-delete-checked': 'deleteCheckedDialog',
        'change .g-select-all': function (e) {
            this.folderListView.checkAll(e.currentTarget.checked);

            if (this.itemListView) {
                this.itemListView.checkAll(e.currentTarget.checked);
            }
        }
    },

    /**
     * If both the child folders and child items have been fetched, and
     * there are neither of either type in this parent container, we should
     * show the "empty container" message.
     */
    _childCountCheck: function () {
        var container = this.$('.g-empty-parent-message').addClass('hide');
        if (this.folderCount === 0 && this.itemCount === 0) {
            container.removeClass('hide');
        }
    },

    /**
     * This should be instantiated with the following properties:
     * -parentModel: The model representing the root node. Must be a User,
                     Collection, or Folder model.
     */
    initialize: function (settings) {
        this.parentModel = settings.parentModel;
        this.upload = settings.upload;
        this.folderAccess = settings.folderAccess;
        this.folderCreate = settings.folderCreate;
        this.folderEdit = settings.folderEdit;
        this.itemCreate = settings.itemCreate;

        this.breadcrumbs = [this.parentModel];

        // Initialize the breadcrumb bar state
        this.breadcrumbView = new girder.views.HierarchyBreadcrumbView({
            objects: this.breadcrumbs,
            parentView: this
        });
        this.breadcrumbView.on('g:breadcrumbClicked', function (idx) {
            this.breadcrumbs = this.breadcrumbs.slice(0, idx + 1);
            this.setCurrentModel(this.breadcrumbs[idx]);
        }, this);

        this.checkedMenuWidget = new girder.views.CheckedMenuWidget({
            pickedCount: this.getPickedCount(),
            pickedCopyAllowed: this.getPickedCopyAllowed(),
            pickedMoveAllowed: this.getPickedMoveAllowed(),
            pickedDesc: this.getPickedDescription(),
            parentView: this
        });

        this.folderListView = new girder.views.FolderListWidget({
            parentType: this.parentModel.resourceName,
            parentId: this.parentModel.get('_id'),
            parentView: this
        });
        this.folderListView.on('g:folderClicked', function (folder) {
            this.descend(folder);

            if (this.uploadWidget) {
                this.uploadWidget.folder = folder;
            }
        }, this).off('g:checkboxesChanged')
                .on('g:checkboxesChanged', this.updateChecked, this)
                .off('g:changed').on('g:changed', function () {
                    this.folderCount = this.folderListView.collection.length;
                    this._childCountCheck();
                }, this);

        if (this.parentModel.resourceName === 'folder') {
            this._initFolderViewSubwidgets();
        } else {
            this.itemCount = 0;
        }

        if (this.parentModel.resourceName === 'folder') {
            this._fetchToRoot(this.parentModel);
        } else {
            this.render();
        }
        girder.events.on('g:login', girder.resetPickedResources, this);
    },

    /**
     * Initializes the subwidgets that are only shown when the parent resource
     * is a folder type.
     */
    _initFolderViewSubwidgets: function () {
        this.itemListView = new girder.views.ItemListWidget({
            folderId: this.parentModel.get('_id'),
            parentView: this
        });
        this.itemListView.on('g:itemClicked', function (item) {
            girder.router.navigate('item/' + item.get('_id'), {trigger: true});
        }, this).off('g:checkboxesChanged')
        .on('g:checkboxesChanged', this.updateChecked, this)
        .off('g:changed').on('g:changed', function () {
            this.itemCount = this.itemListView.collection.length;
            this._childCountCheck();
        }, this);

        this.metadataWidget = new girder.views.MetadataWidget({
            item: this.parentModel,
            parentView: this,
            accessLevel: this.parentModel.getAccessLevel()
        });
    },

    _setRoute: function () {
        var route = this.breadcrumbs[0].resourceName + '/' +
            this.breadcrumbs[0].get('_id');
        if (this.parentModel.resourceName === 'folder') {
            route += '/folder/' + this.parentModel.get('_id');
        }
        girder.router.navigate(route);
        girder.events.trigger('g:hierarchy.route', {route: route});
    },

    _fetchToRoot: function (folder) {
        var parentId = folder.get('parentId');
        var parentType = folder.get('parentCollection');
        var parent = new girder.models[girder.getModelClassByName(parentType)]();
        parent.set({
            _id: parentId
        }).on('g:fetched', function () {
            this.breadcrumbs.push(parent);

            if (parentType === 'folder') {
                this._fetchToRoot(parent);
            } else {
                this.breadcrumbs.reverse();
                this.render();
            }
        }, this).fetch();
    },

    render: function () {
        this.folderCount = null;
        this.itemCount = null;

        this.$el.html(girder.templates.hierarchyWidget({
            type: this.parentModel.resourceName,
            model: this.parentModel,
            level: this.parentModel.getAccessLevel(),
            AccessType: girder.AccessType
        }));

        if (this.$('.g-folder-actions-menu>li>a').length === 0) {
            // Disable the actions button if actions list is empty
            this.$('.g-folder-actions-button').attr('disabled', 'disabled');
        }

        this.breadcrumbView.setElement(this.$('.g-hierarchy-breadcrumb-bar>ol')).render();
        this.checkedMenuWidget.dropdownToggle = this.$('.g-checked-actions-button');
        this.checkedMenuWidget.setElement(this.$('.g-checked-actions-menu')).render();
        this.folderListView.setElement(this.$('.g-folder-list-container')).render();

        if (this.parentModel.resourceName === 'folder') {
            this.itemListView.setElement(this.$('.g-item-list-container')).render();
            this.metadataWidget.setElement(this.$('.g-folder-metadata')).render();
        }

        this.$('.g-folder-info-button,.g-folder-access-button,.g-select-all,' +
            '.g-upload-here-button,.g-checked-actions-button').tooltip({
                container: this.$el,
                animation: false,
                delay: {
                    show: 100
                }
            });
        this.$('.g-folder-actions-button,.g-hierarchy-level-up').tooltip({
            container: this.$el,
            placement: 'left',
            animation: false,
            delay: {
                show: 100
            }
        });

        if (this.upload) {
            this.uploadDialog();
        } else if (this.folderAccess) {
            this.editFolderAccess();
        } else if (this.folderCreate) {
            this.createFolderDialog();
        } else if (this.folderEdit) {
            this.editFolderDialog();
        } else if (this.itemCreate) {
            this.createItemDialog();
        }

        return this;
    },

    /**
     * Descend into the given folder.
     */
    descend: function (folder) {
        this.breadcrumbs.push(folder);
        this.setCurrentModel(folder);
    },

    /**
     * Go to the parent of the current folder
     */
    upOneLevel: function () {
        this.breadcrumbs.pop();
        this.setCurrentModel(this.breadcrumbs[this.breadcrumbs.length - 1]);
    },

    /**
     * Prompt the user to create a new subfolder in the current folder.
     */
    createFolderDialog: function () {
        new girder.views.EditFolderWidget({
            el: $('#g-dialog-container'),
            parentModel: this.parentModel,
            parentView: this
        }).on('g:saved', function (folder) {
            this.folderListView.insertFolder(folder);
            this.updateChecked();
        }, this).render();
    },

    /**
     * Prompt the user to create a new item in the current folder
     */
    createItemDialog: function () {
        new girder.views.EditItemWidget({
            el: $('#g-dialog-container'),
            parentModel: this.parentModel,
            parentView: this
        }).on('g:saved', function (item) {
            this.itemListView.insertItem(item);
            this.updateChecked();
        }, this).render();
    },

    /**
     * Prompt user to edit the current folder
     */
    editFolderDialog: function () {
        new girder.views.EditFolderWidget({
            el: $('#g-dialog-container'),
            parentModel: this.parentModel,
            folder: this.parentModel,
            parentView: this
        }).on('g:saved', function (folder) {
            girder.events.trigger('g:alert', {
                icon: 'ok',
                text: 'Folder info updated.',
                type: 'success',
                timeout: 4000
            });
            this.breadcrumbView.render();
        }, this).render();
    },

    /**
     * Prompt the user to delete the currently viewed folder.
     */
    deleteFolderDialog: function () {
        var view = this;
        var params = {
            text: 'Are you sure you want to delete the folder <b>' +
                  this.parentModel.escape('name') + '</b>?',
            escapedHtml: true,
            yesText: 'Delete',
            confirmCallback: function () {
                view.parentModel.destroy({
                    throwError: true,
                    progress: true
                }).on('g:deleted', function () {
                    this.breadcrumbs.pop();
                    this.setCurrentModel(this.breadcrumbs.slice(-1)[0]);
                }, view);
            }
        };
        girder.confirm(params);
    },

    /**
     * Change the current parent model, i.e. the resource being shown currently.
     *
     * @param parent The parent model to change to.
     */
    setCurrentModel: function (parent, opts) {
        opts = opts || {};
        this.parentModel = parent;

        this.breadcrumbView.objects = this.breadcrumbs;

        this.folderListView.initialize({
            parentType: parent.resourceName,
            parentId: parent.get('_id')
        });

        this.updateChecked();

        if (parent.resourceName === 'folder') {
            if (this.itemListView) {
                this.itemListView.initialize({
                    folderId: parent.get('_id')
                });
            } else {
                this._initFolderViewSubwidgets();
            }
        }
        this.render();
        if (!_.has(opts, 'setRoute') || opts.setRoute) {
            this._setRoute();
        }
    },

    /**
     * Based on a resource collection with either has model references or
     * checkbox references, return a string that describes the collection.
     * :param resources: a hash with different resources.
     * :returns: description of the resources.
     */
    _describeResources: function (resources) {
        /* If the resources aren't English words or don't have simple plurals,
         * this will need to be refactored. */
        var kinds = ['folder', 'item'];

        var desc = [];
        for (var i = 0; i < kinds.length; i += 1) {
            var kind = kinds[i];
            if (resources[kind] && resources[kind].length) {
                desc.push(resources[kind].length + ' ' + kind +
                          (resources[kind].length !== 1 ? 's' : ''));
            }
        }
        switch (desc.length) {
            case 0:
                return 'nothing';
            case 1:
                return desc[0];
            case 2:
                return desc[0] + ' and ' + desc [1];
            /* If we add a third model type, enable this:
            default:
                desc[desc.length-1] = 'and ' + desc[desc.length-1];
                return ', '.join(desc);
             */
        }
    },

    /**
     * Prompt the user to delete the currently checked items.
     */
    deleteCheckedDialog: function () {
        var view = this;
        var folders = this.folderListView.checked;
        var items;
        if (this.itemListView && this.itemListView.checked.length) {
            items = this.itemListView.checked;
        }
        var desc = this._describeResources({folder:folders, item:items});

        var params = {
            text: 'Are you sure you want to delete the checked resources (' +
                  desc + ')?',

            yesText: 'Delete',
            confirmCallback: function () {
                var url = 'resource';
                var resources = view._getCheckedResourceParam();
                /* Content on DELETE requests is somewhat oddly supported (I
                 * can't get it to work under jasmine/phantom), so override the
                 * method. */
                girder.restRequest({path: url, type: 'POST',
                    data: {resources: resources, progress: true},
                    headers: {'X-HTTP-Method-Override': 'DELETE'}
                }).done(function () {
                    view.setCurrentModel(view.parentModel, {setRoute: false});
                });
            }
        };
        girder.confirm(params);
    },

    /**
     * Show and handle the upload dialog
     */
    uploadDialog: function () {
        var container = $('#g-dialog-container');

        new girder.views.UploadWidget({
            el: container,
            parent: this.parentModel,
            parentType: this.parentType,
            parentView: this
        }).on('g:uploadFinished', function () {
            girder.dialogs.handleClose('upload');
            this.upload = false;
            this.setCurrentModel(this.parentModel, {setRoute: false});
        }, this).render();
    },

    /**
     * When any of the checkboxes is changed, this will be called to update
     * the checked menu state.
     */
    updateChecked: function () {
        var folders = this.folderListView.checked,
            items = [];

        // Only show actions corresponding to the minimum access level over
        // the whole set of checked resources.
        var minFolderLevel = girder.AccessType.ADMIN;
        _.every(folders, function (cid) {
            var folder = this.folderListView.collection.get(cid);
            minFolderLevel = Math.min(minFolderLevel, folder.getAccessLevel());
            return minFolderLevel > girder.AccessType.READ; // acts as 'break'
        }, this);

        var minItemLevel = girder.AccessType.ADMIN;
        if (this.itemListView) {
            items = this.itemListView.checked;
            if (items.length) {
                minItemLevel = Math.min(minItemLevel, this.parentModel.getAccessLevel());
            }
        }
        this.checkedMenuWidget.update({
            minFolderLevel: minFolderLevel,
            minItemLevel: minItemLevel,
            folderCount: folders.length,
            itemCount: items.length,
            pickedCount: this.getPickedCount(),
            pickedCopyAllowed: this.getPickedCopyAllowed(),
            pickedMoveAllowed: this.getPickedMoveAllowed(),
            pickedDesc: this.getPickedDescription()
        });
    },

    getPickedCount: function () {
        var pickedCount = 0;
        if (girder.pickedResources && girder.pickedResources.resources) {
            _.each(girder.pickedResources.resources, function (list) {
                pickedCount += list.length;
            });
        }
        return pickedCount;
    },

    getPickedCopyAllowed: function () {
        /* We must have something picked */
        if (!girder.pickedResources) {
            return false;
        }
        /* If we have an item picked but this page isn't a folder's list, then
         * you can't move or copy them here. */
        if (this.parentModel.resourceName !== 'folder') {
            if (girder.pickedResources.resources.item &&
                    girder.pickedResources.resources.item.length) {
                return false;
            }
        }
        /* We must have permission to write to this folder to be allowed to
         * copy. */
        if (this.parentModel.getAccessLevel() < girder.AccessType.WRITE) {
            return false;
        }
        return true;
    },

    getPickedMoveAllowed: function () {
        /* All of the restrictions for copy are the same */
        if (!this.getPickedCopyAllowed()) {
            return false;
        }
        /* We also can't move an item or folder if we don't have permission to
         * delete that item or folder (since a move deletes it from the
         * original spot). */
        if (girder.pickedResources.minFolderLevel < girder.AccessType.ADMIN) {
            return false;
        }
        if (girder.pickedResources.minItemLevel < girder.AccessType.WRITE) {
            return false;
        }
        return true;
    },

    getPickedDescription: function () {
        if (!girder.pickedResources || !girder.pickedResources.resources) {
            return '';
        }
        return this._describeResources(girder.pickedResources.resources);
    },

    downloadFolder: function () {
        this.parentModel.download();
    },

    /**
     * Get a parameter that can be added to a url for the checked resources.
     */
    _getCheckedResourceParam: function (asObject) {
        var resources = {folder:[], item:[]};
        var folders = this.folderListView.checked;
        _.each(folders, function (cid) {
            var folder = this.folderListView.collection.get(cid);
            resources.folder.push(folder.id);
        }, this);
        if (this.itemListView) {
            var items = this.itemListView.checked;
            _.each(items, function (cid) {
                var item = this.itemListView.collection.get(cid);
                resources.item.push(item.id);
                return true;
            }, this);
        }
        _.each(resources, function (list, key) {
            if (!list.length) {
                delete resources[key];
            }
        });
        if (asObject) {
            return resources;
        }
        return JSON.stringify(resources);
    },

    downloadChecked: function () {
        var url = girder.apiRoot + '/resource/download';
        var resources = this._getCheckedResourceParam();
        var data = {resources: resources};
        var token = girder.cookie.find('girderToken');
        if (token) {
            data.token = token;
        }
        this.redirectViaForm('GET', url, data);
    },

    pickChecked: function () {
        if (!girder.pickedResources) {
            girder.pickedResources = {
                resources: {},
                minItemLevel: girder.AccessType.ADMIN,
                minFolderLevel: girder.AccessType.ADMIN
            };
        }
        /* Maintain our minimum permissions.  It is expensive to compute them
         * arbitrarily later. */
        var folders = this.folderListView.checked;
        _.every(folders, function (cid) {
            var folder = this.folderListView.collection.get(cid);
            girder.pickedResources.minFolderLevel = Math.min(
                girder.pickedResources.minFolderLevel,
                folder.getAccessLevel());
            return (girder.pickedResources.minFolderLevel >
                    girder.AccessType.READ); // acts as 'break'
        }, this);
        if (this.itemListView) {
            var items = this.itemListView.checked;
            if (items.length) {
                girder.pickedResources.minItemLevel = Math.min(
                    girder.pickedResources.minItemLevel,
                    this.parentModel.getAccessLevel());
            }
        }
        var resources = this._getCheckedResourceParam(true);
        var pickDesc = this._describeResources(resources);
        /* Merge these resources with any that are already picked */
        var existing = girder.pickedResources.resources;
        var oldDesc = this._describeResources(existing);
        _.each(existing, function (list, resource) {
            if (!resources[resource]) {
                resources[resource] = list;
            } else {
                resources[resource] = _.union(list, resources[resource]);
            }
        });
        girder.pickedResources.resources = resources;
        this.updateChecked();
        var totalPickDesc = this.getPickedDescription();
        var desc = totalPickDesc + ' picked.';
        if (pickDesc !== totalPickDesc) {
            desc = pickDesc + ' added to picked resources.  Now ' + desc;
        }
        girder.events.trigger('g:alert', {
            icon: 'ok',
            text: desc,
            type: 'info',
            timeout: 4000
        });
    },

    movePickedResources: function () {
        if (!this.getPickedMoveAllowed()) {
            return;
        }
        var view = this;
        var url = 'resource/move';
        var resources = JSON.stringify(girder.pickedResources.resources);
        girder.restRequest({path: url, type: 'PUT',
            data: {
                resources: resources,
                parentType: this.parentModel.resourceName,
                parentId: this.parentModel.get('_id'),
                progress: true
            }
        }).done(function () {
            view.setCurrentModel(view.parentModel, {setRoute: false});
        });
        this.clearPickedResources();
    },

    copyPickedResources: function () {
        if (!this.getPickedCopyAllowed()) {
            return;
        }
        var view = this;
        var url = 'resource/copy';
        var resources = JSON.stringify(girder.pickedResources.resources);
        girder.restRequest({path: url, type: 'POST',
            data: {
                resources: resources,
                parentType: this.parentModel.resourceName,
                parentId: this.parentModel.get('_id'),
                progress: true
            }
        }).done(function () {
            view.setCurrentModel(view.parentModel, {setRoute: false});
        });
        this.clearPickedResources();
    },

    clearPickedResources: function (event) {
        girder.resetPickedResources();
        this.updateChecked();
        if (event) {
            girder.events.trigger('g:alert', {
                icon: 'ok',
                text: 'Cleared picked resources',
                type: 'info',
                timeout: 4000
            });
        }
    },

    redirectViaForm: function (method, url, data) {
        var form = $('<form action="' + url + '" method="' + method + '"/>');
        _.each(data, function (value, key) {
            form.append($('<input/>').attr(
                {type: 'text', name: key, value: value}));
        });
        $(form).submit();
    },

    editFolderAccess: function () {
        new girder.views.AccessWidget({
            el: $('#g-dialog-container'),
            modelType: this.parentModel.resourceName,
            model: this.parentModel,
            parentView: this
        }).on('g:saved', function (folder) {
            // need to do anything?
        }, this);
    }
});

/* Because we need to be able to clear picked resources when the current user
 * changes, this function is placed in the girder namespace. */
girder.resetPickedResources = function () {
    girder.pickedResources = null;
};

/**
 * Renders the breadcrumb list in the hierarchy widget.
 */
girder.views.HierarchyBreadcrumbView = girder.View.extend({
    events: {
        'click a.g-breadcrumb-link': function (event) {
            var link = $(event.currentTarget);
            this.trigger('g:breadcrumbClicked', parseInt(link.attr('g-index'), 10));
        }
    },

    initialize: function (settings) {
        this.objects = settings.objects;
    },

    render: function () {
        // Clone the array so we don't alter the instance's copy
        var objects = this.objects.slice(0);

        // Pop off the last object, it refers to the currently viewed
        // object and should be the "active" class, and not a link.
        var active = objects.pop();

        this.$el.html(girder.templates.hierarchyBreadcrumb({
            links: objects,
            current: active
        }));
    }
});
