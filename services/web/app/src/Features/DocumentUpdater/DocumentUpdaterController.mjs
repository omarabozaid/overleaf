import logger from '@overleaf/logger'
import DocumentUpdaterHandler from './DocumentUpdaterHandler.mjs'
import ProjectLocator from '../Project/ProjectLocator.mjs'
import { plainTextResponse } from '../../infrastructure/Response.mjs'
import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../Authentication/SessionManager.mjs'
import ChatApiHandler from '../Chat/ChatApiHandler.mjs'
import EditorRealTimeController from '../Editor/EditorRealTimeController.mjs'
import UserInfoController from '../User/UserInfoController.mjs'
import UserInfoManager from '../User/UserInfoManager.mjs'

async function getDoc(req, res) {
  const projectId = req.params.Project_id
  const docId = req.params.Doc_id

  try {
    const { element: doc } = await ProjectLocator.promises.findElement({
      project_id: projectId,
      element_id: docId,
      type: 'doc',
    })

    const { lines } = await DocumentUpdaterHandler.promises.getDocument(
      projectId,
      docId,
      -1 // latest version only
    )

    res.setContentDisposition('attachment', { filename: doc.name })
    plainTextResponse(res, lines.join('\n'))
  } catch (err) {
    if (err.name === 'NotFoundError') {
      logger.warn(
        { err, projectId, docId },
        'entity not found when downloading doc'
      )

      return res.sendStatus(404)
    }

    logger.err(
      { err, projectId, docId },
      'error getting document for downloading'
    )

    return res.sendStatus(500)
  }
}

async function acceptChanges(req, res) {
  const projectId = req.params.Project_id
  const docId = req.params.Doc_id
  const changeIds = req.body.change_ids || []
  const userId = SessionManager.getLoggedInUserId(req.session)

  await DocumentUpdaterHandler.promises.acceptChanges(
    projectId,
    docId,
    changeIds,
    userId
  )

  res.sendStatus(204)
}

async function resolveThread(req, res) {
  const projectId = req.params.Project_id
  const docId = req.params.Doc_id
  const threadId = req.params.thread_id
  const userId = SessionManager.getLoggedInUserId(req.session)

  await DocumentUpdaterHandler.promises.resolveThread(
    projectId,
    docId,
    threadId,
    userId
  )
  await ChatApiHandler.promises.resolveThread(projectId, threadId, userId)

  const user = await UserInfoManager.promises.getPersonalInfo(userId)
  EditorRealTimeController.emitToRoom(
    projectId,
    'resolve-thread',
    threadId,
    UserInfoController.formatPersonalInfo(user)
  )

  res.sendStatus(204)
}

async function reopenThread(req, res) {
  const projectId = req.params.Project_id
  const docId = req.params.Doc_id
  const threadId = req.params.thread_id
  const userId = SessionManager.getLoggedInUserId(req.session)

  await DocumentUpdaterHandler.promises.reopenThread(
    projectId,
    docId,
    threadId,
    userId
  )
  await ChatApiHandler.promises.reopenThread(projectId, threadId)

  EditorRealTimeController.emitToRoom(projectId, 'reopen-thread', threadId)

  res.sendStatus(204)
}

async function deleteThread(req, res) {
  const projectId = req.params.Project_id
  const docId = req.params.Doc_id
  const threadId = req.params.thread_id
  const userId = SessionManager.getLoggedInUserId(req.session)

  await DocumentUpdaterHandler.promises.deleteThread(
    projectId,
    docId,
    threadId,
    userId
  )
  await ChatApiHandler.promises.deleteThread(projectId, threadId)

  EditorRealTimeController.emitToRoom(projectId, 'delete-thread', threadId)

  res.sendStatus(204)
}

export default {
  acceptChanges: expressify(acceptChanges),
  deleteThread: expressify(deleteThread),
  getDoc: expressify(getDoc),
  reopenThread: expressify(reopenThread),
  resolveThread: expressify(resolveThread),
}
