import appRootPath from 'app-root-path'
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { Quaternion, Vector3 } from 'three'

import { NetworkId } from '@xrengine/common/src/interfaces/NetworkId'
import { AssetLoader } from '@xrengine/engine/src/assets/classes/AssetLoader'
import { loadDRACODecoder } from '@xrengine/engine/src/assets/loaders/gltf/NodeDracoLoader'
import { AnimationManager } from '@xrengine/engine/src/avatar/AnimationManager'
import { AvatarAnimationComponent } from '@xrengine/engine/src/avatar/components/AvatarAnimationComponent'
import { AvatarComponent } from '@xrengine/engine/src/avatar/components/AvatarComponent'
import {
  loadAvatarForUser,
  loadAvatarModelAsset,
  setupAvatarForUser
} from '@xrengine/engine/src/avatar/functions/avatarFunctions'
import { createAvatar } from '@xrengine/engine/src/avatar/functions/createAvatar'
import { Engine } from '@xrengine/engine/src/ecs/classes/Engine'
import { addComponent, getComponent } from '@xrengine/engine/src/ecs/functions/ComponentFunctions'
import { createEntity } from '@xrengine/engine/src/ecs/functions/EntityFunctions'
import { createEngine } from '@xrengine/engine/src/initializeEngine'
import { NetworkObjectComponent } from '@xrengine/engine/src/networking/components/NetworkObjectComponent'
import { WorldNetworkAction } from '@xrengine/engine/src/networking/functions/WorldNetworkAction'
import { WorldNetworkActionReceptor } from '@xrengine/engine/src/networking/functions/WorldNetworkActionReceptor'
import { Physics } from '@xrengine/engine/src/physics/classes/Physics'
import { createMockNetwork } from '@xrengine/engine/tests/util/createMockNetwork'
import { overrideFileLoaderLoad } from '@xrengine/engine/tests/util/loadGLTFAssetNode'

import packageJson from '../../package.json'

overrideFileLoaderLoad()

// for easier debug
console.warn = () => {}

const avatarPath = `/packages/projects/projects/${packageJson.name}/avatars/`
const animGLB = '/packages/client/public/default_assets/Animations.glb'

const getAllFiles = (dirPath, arrayOfFiles) => {
  const avatarPathAbsolute = path.join(appRootPath.path, dirPath)
  const files = fs.readdirSync(avatarPathAbsolute)
  arrayOfFiles = arrayOfFiles || []
  files.forEach(function (file) {
    if (fs.statSync(avatarPathAbsolute + '/' + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + '/' + file, arrayOfFiles)
    } else {
      arrayOfFiles.push(path.join(dirPath, '/', file))
    }
  })
  return arrayOfFiles
}

const fetchAvatarList = () => {
  const assetPaths = getAllFiles(avatarPath, [])
  const avatarList = assetPaths.filter((url) => url.endsWith('glb'))
  return avatarList
}

before(async () => {
  // const avatarPathAbsolute = path.join(appRootPath.path, avatarPath)
  // assetPaths = getAllFiles(avatarPathAbsolute, [])
  await loadDRACODecoder()
  const animationGLTF = await AssetLoader.loadAsync(animGLB)
  AnimationManager.instance.getAnimations(animationGLTF)
})

describe('avatarFunctions Integration', async () => {
  beforeEach(async () => {
    createEngine()
    createMockNetwork()
    Engine.instance.userId = Engine.instance.currentWorld.worldNetwork.hostId
    Engine.instance.publicPath = ''
    await Physics.load()
    Engine.instance.currentWorld.physicsWorld = Physics.createWorld()
  })

  describe('loadAvatarForEntity', () => {
    const assetPaths = fetchAvatarList()
    for (const modelURL of assetPaths) {
      it('should bone match, and rig avatar ' + modelURL.replace(avatarPath, ''), async function () {
        const spawnAction = WorldNetworkAction.spawnAvatar({
          $from: Engine.instance.userId,
          position: new Vector3(),
          rotation: new Quaternion(),
          networkId: 1 as NetworkId
        })

        WorldNetworkActionReceptor.receiveSpawnObject(spawnAction)
        createAvatar(spawnAction)

        const entity = Engine.instance.currentWorld.getUserAvatarEntity(Engine.instance.userId)

        const avatar = getComponent(entity, AvatarComponent)
        // make sure this is set later on
        avatar.avatarHeight = 0
        avatar.avatarHalfHeight = 0

        // run the logic
        const model = await loadAvatarModelAsset(modelURL)
        setupAvatarForUser(entity, model)

        // do assertions
        const avatarComponent = getComponent(entity, AvatarComponent)

        assert(avatarComponent.modelContainer.children.length)
        assert(avatarComponent.avatarHeight > 0)
        assert(avatarComponent.avatarHalfHeight > 0)

        const { rig } = getComponent(entity, AvatarAnimationComponent)
        assert(rig)
        assert(rig.Hips)
        assert(rig.Head)
        assert(rig.Neck)
        assert(rig.Spine || rig.Spine1 || rig.Spine2)
        assert(rig.LeftFoot)
        assert(rig.RightFoot)
        assert((rig.RightArm || rig.RightForeArm) && rig.RightHand)
        assert((rig.LeftArm || rig.LeftForeArm) && rig.LeftHand)
        assert((rig.RightUpLeg || rig.RightLeg) && rig.RightFoot)
        assert((rig.LeftUpLeg || rig.LeftLeg) && rig.LeftFoot)

        // TODO: this currently isn't working, the update method doesnt show up in the VRM object
        // assert.equal(hasComponent(entity, UpdatableComponent), asset.split('.').pop() === 'vrm')
      })
    }
  })
})
