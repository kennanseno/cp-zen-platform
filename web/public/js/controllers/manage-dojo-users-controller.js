'use strict';

function cdManageDojoUsersCtrl($scope, $state, auth, $q, cdDojoService, alertService, tableUtils, usSpinnerService, cdBadgesService, $translate, cdUsersService, initUserTypes) {
  var dojoId = $state.params.id;
  var usersDojosLink = [];
  $scope.itemsPerPage = 10;
  $scope.userTypes = [];
  $scope.userPermissions = [];
  $scope.selectedUserPermissions = {};
  $scope.canUpdateUserPermissions = false;
  $scope.canRemoveUsers = false;
  $scope.userPermissionsModel = {};
  $scope.isDojoAdmin = false;
  $scope.badgeModel = {};
  $scope.awardBadgeButtonModel = {};
  $scope.manageDojoUsersPageTitle = $translate.instant('Manage Dojo Users');
  $scope.invite = {};

  auth.get_loggedin_user(function (user) {
    $scope.currentUser = user;
    //Updating user permissions and user types require the same permissions.
    //Remove users also requires the same permissions,
    //therefore we can check if the user can update user permissions & delete users by checking the result from the
    //canUpdateUser method.
    canUpdateUser(function (result) {
      $scope.canUpdateUserPermissions = result;
      $scope.canRemoveUsers = result;
    });
  });

  cdBadgesService.listBadges(function (response) {
    $scope.badges = response.badges;
  });

  $scope.pageChanged = function () {
    $scope.loadPage(false);
  };

  $scope.loadPage = function(resetFlag, cb) {
    cb = cb || function(){};

    var loadPageData = tableUtils.loadPage(resetFlag, $scope.itemsPerPage, $scope.pageNo, $scope.filterQuery, $scope.sort);
    $scope.pageNo = loadPageData.pageNo;
    $scope.myDojos = [];
    var query = {dojoId:dojoId, limit$: $scope.itemsPerPage, skip$: loadPageData.skip};
    
    auth.get_loggedin_user(function (user) {
      var query = {userId: user.id, dojoId: dojoId};
      cdDojoService.getUsersDojos(query, function (usersDojos) {
        var userDojo = usersDojos[0]
        user.userTypes = userDojo.userTypes;
        var inviteUserTypes = angular.copy(initUserTypes.data);
        if(_.contains(user.userTypes, 'mentor')) {
          inviteUserTypes = _.without(inviteUserTypes, _.findWhere(inviteUserTypes, {name: 'champion'}));
        } else if(_.contains(user.userTypes, 'parent-guardian')) {
          inviteUserTypes = _.chain(inviteUserTypes)
            .without(_.findWhere(inviteUserTypes, {name: 'champion'}))
            .without(_.findWhere(inviteUserTypes, {name: 'mentor'}))
            .value();
        } else if(_.contains(user.userTypes, 'attendee-o13')) {
          $scope.userTypes = _.chain(inviteUserTypes)
            .without(_.findWhere(inviteUserTypes, {name: 'champion'}))
            .without(_.findWhere(inviteUserTypes, {name: 'mentor'}))
            .without(_.findWhere(inviteUserTypes, {name: 'parent-guardian'}))
            .value();
        } else if(_.contains(user.userTypes, 'attendee-u13')) {
          inviteUserTypes = [];
        }
        $scope.userTypes = inviteUserTypes;
      });
    });

    cdDojoService.getUserPermissions(function (response) {
      $scope.userPermissions = response;
    });

    cdDojoService.getUsersDojos(query, function (response) {
      usersDojosLink = response;
    });

    cdDojoService.loadDojoUsers(query, function (response) {
      _.each(response, function (user) {
        var thisUsersDojoLink = _.findWhere(usersDojosLink, {userId:user.id});
        user.types = thisUsersDojoLink.userTypes;
        user.frontEndTypes = _.map(thisUsersDojoLink.userTypes, function (userType) {
          var userTypeFound = _.find(initUserTypes.data, function (initUserType) {
            return userType === initUserType.name;
          });
          return $translate.instant(userTypeFound.title);
        });
        user.permissions = thisUsersDojoLink.userPermissions;
        user.isMentor = _.contains(user.types, 'mentor');
        user.isDojoOwner = (thisUsersDojoLink.owner === 1) ? true : false;
        user.backgroundChecked = thisUsersDojoLink.backgroundChecked;
        user.userDojoId = thisUsersDojoLink.id;
        $scope.selectedUserPermissions[user.id] = user.permissions;
        $scope.userPermissionsModel[user.id] = {};

        _.each(user.permissions, function (permission) {
          $scope.userPermissionsModel[user.id][permission.name] = true;
        });

      });
      $scope.users = response;
      //Query the loadDojoUsers service without the limit to get the total number of users.
      cdDojoService.loadDojoUsers({dojoId: dojoId}, function (response) {
        $scope.totalItems = response.length;
      });
      return cb();
    });

  };

  $scope.updateMentorBackgroundCheck = function (user) {
    var userDojo = {
      id: user.userDojoId,
      backgroundChecked: user.backgroundChecked
    };

    cdDojoService.saveUsersDojos(userDojo, null, function (err) {
      alertService.showError(JSON.stringify(err));
    });
  }

  $scope.updateUserPermissions = function(user, permission) {
    var hasPermission = false;
    canUpdateUser(function (result) {
      hasPermission = result;
      if (hasPermission) {
        var query = {dojoId:dojoId};
        delete permission.$$hashKey;
        var userDojoLink = _.findWhere(usersDojosLink, {userId:user.id});
        if($scope.userPermissionsModel[user.id][permission.name]) {
          //Add to user permissions
          if(!userDojoLink.userPermissions) userDojoLink.userPermissions = [];
          userDojoLink.userPermissions.push(permission);
          //Save to db
          if(userDojoLink.userTypes[0] && userDojoLink.userTypes[0].text) userDojoLink.userTypes = _.pluck(userDojoLink.userTypes, 'text');
          cdDojoService.saveUsersDojos(userDojoLink, function (response) {
            if(response.error) {
              alertService.showError($translate.instant(response.error));
              //Revert checkbox
              $scope.userPermissionsModel[user.id][permission.name] = !$scope.userPermissionsModel[user.id][permission.name];
            } else {
              alertService.showAlert($translate.instant('User permissions successfully updated.'));
            }
          }, function (err) {
            alertService.showError($translate.instant('Error saving permission') + ' ' + err);
            //Revert checkbox 
            $scope.userPermissionsModel[user.id][permission.name] = !$scope.userPermissionsModel[user.id][permission.name];
          });
        } else {
          //Remove from user permissions
          user.permissions = _.without(user.permissions, _.findWhere(user.permissions, {name: permission.name}));
          userDojoLink.userPermissions = user.permissions;
          if(userDojoLink.userTypes[0] && userDojoLink.userTypes[0].text) userDojoLink.userTypes = _.pluck(userDojoLink.userTypes, 'text');
          //Save to db
          cdDojoService.saveUsersDojos(userDojoLink, function (response) {
            if(response.error)  {
              alertService.showError($translate.instant(response.error));
              //Revert checkbox
              $scope.userPermissionsModel[user.id][permission.name] = !$scope.userPermissionsModel[user.id][permission.name];
              //Re-add permission
              user.permissions.push(permission);
            } else {
              alertService.showAlert($translate.instant('User permissions successfully updated.'));
            }
          }, function (err) {
            alertService.showError($translate.instant('Error removing permission') + ' ' +err);
            //Revert checkbox 
            $scope.userPermissionsModel[user.id][permission.name] = !$scope.userPermissionsModel[user.id][permission.name];
          });
        }
      } else {
        alertService.showAlert($translate.instant('You do not have permission to update user permissions'));
        //Revert checkbox 
        $scope.userPermissionsModel[user.id][permission.name] = !$scope.userPermissionsModel[user.id][permission.name];
      }
    });
  }

  $scope.loadUserTypes = function(query) {
    var filteredUserTypes = _.chain(initUserTypes.data)
      .filter(function (userType) {
       return userType.title.toLowerCase().indexOf(query.toLowerCase()) > -1; 
      })
      .map(function (userType) {
        return userType.title;
      })
      .value();
    return filteredUserTypes;
  }

  $scope.pushChangedUser = function(user, method, $tag) {
    var hasPermission = false;
    canUpdateUser(function (result) {
      hasPermission = result;

      if(hasPermission) {

        var updatedUserTypes = _.chain(angular.copy(user.frontEndTypes))
          .pluck('text')
          .map(function (userType) {
            var initUserTypeFound = _.find(initUserTypes.data, function (initUserType) {
              return initUserType.title === userType;
            });
            return initUserTypeFound.name;
          })
          .value();

        var userDojoLink = _.findWhere(usersDojosLink, {userId:user.id});
        if(!userDojoLink.userTypes) userDojoLink.userTypes = [];
        userDojoLink.userTypes = updatedUserTypes;
        cdDojoService.saveUsersDojos(userDojoLink, function (response) {
          if(response.error) { 
            alertService.showError($translate.instant(response.error));
            //Revert user types
            if(method === 'add') user.frontEndTypes.pop();
            if(method === 'remove') user.frontEndTypes.push($tag);
          } else {
            alertService.showAlert($translate.instant('User types successfully updated.'));
          }
        }, function (err) {
          alertService.showError($translate.instant('Error saving user type') + ' ' + err);
        });
      } else {
        alertService.showAlert($translate.instant('You do not have permission to update user types'));
        if(method === 'add') user.frontEndTypes.pop();
        if(method === 'remove') user.frontEndTypes.push($tag);
      }
    });
  }

  function canUpdateUser(cb) {
    //Can update user types if:
    // - Current user is champion
    // - Current user is Dojo Admin
    function getUsersDojos() {
      return $q(function (resolve, reject) {
        var query = {userId: $scope.currentUser.id, dojoId: dojoId};
        var isChampion;
        var isDojoAdmin;
        cdDojoService.getUsersDojos(query, function (response) {
          var userDojo = response[0];
          isChampion   = _.contains(userDojo.userTypes, 'champion');
          isDojoAdmin  = _.find(userDojo.userPermissions, function(userPermission) {
                          return userPermission.name === 'dojo-admin';
                        });
          if(isDojoAdmin) $scope.isDojoAdmin = true;
          if(isChampion && isDojoAdmin) return resolve(true);
          return resolve(false);
        }, function (err) {
          alertService.showError($translate.instant('Error loading user dojo entity') + ' <br /> ' +
          (err.error || JSON.stringify(err)));
        });
      });
    }

    getUsersDojos().then(function (result) {
      cb(result);
    });
  }

  $scope.inviteUser = function (invite, context) {
    usSpinnerService.spin('manage-dojo-users-spinner');
    cdDojoService.generateUserInviteToken({email:invite.email, userType:invite.userType.name, dojoId:dojoId}, function (response) {
      usSpinnerService.stop('manage-dojo-users-spinner');
      alertService.showAlert($translate.instant('Invite Sent'));
      context.inviteMentorForm.reset();
    }, function (err) {
      usSpinnerService.stop('manage-dojo-users-spinner');
      alertService.showError($translate.instant('Error sending invite') + ' ' + err);
    });
  }

  $scope.removeUser = function (user) {
    if($scope.canRemoveUsers) {
      usSpinnerService.spin('manage-dojo-users-spinner');
      var userId = user.id;
      cdDojoService.removeUsersDojosLink(userId, dojoId, function (response) {
        if(response.error) {
          usSpinnerService.stop('manage-dojo-users-spinner');
          alertService.showError($translate.instant(response.error));
        } else {
          usSpinnerService.stop('manage-dojo-users-spinner');
          alertService.showAlert($translate.instant('User successfully removed from Dojo.'));
          $scope.loadPage(true);
        }
      }, function (err) {
        usSpinnerService.stop('manage-dojo-users-spinner');
        alertService.showError($translate.instant('Error removing user') + ' ' + err);
      });
    } else {
      alertService.showAlert($translate.instant('You do not have permission to remove users'));
    }
  }

  $scope.badgeSelected = function (user) {
    $scope.awardBadgeButtonModel[user.id] = true;
    $scope.$watch('badgeModel', function (val) {
      if(!val[user.id]) $scope.awardBadgeButtonModel[user.id] = false;
    });
  }

  $scope.awardBadge = function (user, badge) {
    usSpinnerService.spin('manage-dojo-users-spinner');
    var applicationData = {
      user: user,
      badge: badge
    };

    cdBadgesService.sendBadgeApplication(applicationData, function (response) {
      usSpinnerService.stop('manage-dojo-users-spinner');
      if(response.error) return alertService.showError($translate.instant(response.error));
      alertService.showAlert($translate.instant('Badge Application Sent!'));
    });
  }

  $scope.loadPage(true);

}

angular.module('cpZenPlatform')
    .controller('manage-dojo-users-controller', ['$scope', '$state', 'auth', '$q', 'cdDojoService', 'alertService', 'tableUtils', 'usSpinnerService', 'cdBadgesService', '$translate', 'cdUsersService', 'initUserTypes', cdManageDojoUsersCtrl]);

