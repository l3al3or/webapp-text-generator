'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import cn from 'classnames'
import { useBoolean, useClickAway } from 'ahooks'
import { XMarkIcon } from '@heroicons/react/24/outline'
import RunOnce from './run-once'
import RunBatch from './run-batch'
import ResDownload from './run-batch/res-download'
import Result from './result'
import Button from './base/button'
import s from './style.module.css'
import AlertCircle from '@/app/components/base/icons/line/alert-circle'
import TabHeader from '@/app/components/base/tab-header'
import useBreakpoints, { MediaType } from '@/hooks/use-breakpoints'
import { fetchAppParams, updateFeedback } from '@/service'
import Toast from '@/app/components/base/toast'
import type { Feedbacktype, PromptConfig, VisionFile, VisionSettings } from '@/types/app'
import { Resolution, TransferMethod } from '@/types/app'
import { changeLanguage } from '@/i18n/i18next-config'
import Loading from '@/app/components/base/loading'
import AppUnavailable from '@/app/components/app-unavailable'
import { API_KEY, APP_ID, APP_INFO, DEFAULT_VALUE_MAX_LEN, IS_WORKFLOW } from '@/config'
import { userInputsFormToPromptVariables } from '@/utils/prompt'

const GROUP_SIZE = 5 // to avoid RPM(Request per minute) limit. The group task finished then the next group.
enum TaskStatus {
  pending = 'pending',
  running = 'running',
  completed = 'completed',
  failed = 'failed',
}

type TaskParam = {
  inputs: Record<string, any>
}

type Task = {
  id: number
  status: TaskStatus
  params: TaskParam
}

const TextGeneration = () => {
  const { t } = useTranslation()

  const media = useBreakpoints()
  const isPC = media === MediaType.pc
  const isTablet = media === MediaType.tablet
  const isMobile = media === MediaType.mobile

  const [currTab, setCurrTab] = useState<string>('create')
  // Notice this situation isCallBatchAPI but not in batch tab
  const [isCallBatchAPI, setIsCallBatchAPI] = useState(false)
  const isInBatchTab = currTab === 'batch'

  /*
  * app info
  */
  const hasSetAppConfig = APP_ID && API_KEY
  const [appUnavailable, setAppUnavailable] = useState<boolean>(false)
  const [isUnknwonReason, setIsUnknwonReason] = useState<boolean>(false)

  const [inputs, setInputs] = useState<Record<string, any>>({})
  const [promptConfig, setPromptConfig] = useState<PromptConfig | null>(null)
  const [isResponsing, { setTrue: setResponsingTrue, setFalse: setResponsingFalse }] = useBoolean(false)
  const [completionRes, setCompletionRes] = useState('')
  const { notify } = Toast
  const isNoData = !completionRes
  const [messageId, setMessageId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedbacktype>({
    rating: null,
  })

  const handleFeedback = async (feedback: Feedbacktype) => {
    await updateFeedback({ url: `/messages/${messageId}/feedbacks`, body: { rating: feedback.rating } })
    setFeedback(feedback)
  }

  const logError = (message: string) => {
    notify({ type: 'error', message })
  }

  const checkCanSend = () => {
    const prompt_variables = promptConfig?.prompt_variables
    if (!prompt_variables || prompt_variables?.length === 0)
      return true

    let hasEmptyInput = false
    const requiredVars = prompt_variables?.filter(({ key, name, required }) => {
      const res = (!key || !key.trim()) || (!name || !name.trim()) || (required || required === undefined || required === null)
      return res
    }) || [] // compatible with old version
    requiredVars.forEach(({ key }) => {
      if (hasEmptyInput)
        return

      if (!inputs[key])
        hasEmptyInput = true
    })

    if (hasEmptyInput) {
      logError(t('app.errorMessage.valueOfVarRequired'))
      return false
    }
    return !hasEmptyInput
  }
  const [controlSend, setControlSend] = useState(0)
  const [controlStopResponding, setControlStopResponding] = useState(0)
  const [visionConfig, setVisionConfig] = useState<VisionSettings>({
    enabled: false,
    number_limits: 2,
    detail: Resolution.low,
    transfer_methods: [TransferMethod.local_file],
  })
  const [completionFiles, setCompletionFiles] = useState<VisionFile[]>([])
  const handleSend = async () => {
    setIsCallBatchAPI(false)
    setControlSend(Date.now())
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    setAllTaskList([]) // clear batch task running status
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    showResSidebar()
  }

  const [controlRetry, setControlRetry] = useState(0)
  const handleRetryAllFailedTask = () => {
    setControlRetry(Date.now())
  }
  const [allTaskList, doSetAllTaskList] = useState<Task[]>([])
  const allTaskListRef = useRef<Task[]>([])
  const getLatestTaskList = () => allTaskListRef.current
  const setAllTaskList = (taskList: Task[]) => {
    doSetAllTaskList(taskList)
    allTaskListRef.current = taskList
  }
  const pendingTaskList = allTaskList.filter(task => task.status === TaskStatus.pending)
  const noPendingTask = pendingTaskList.length === 0
  const showTaskList = allTaskList.filter(task => task.status !== TaskStatus.pending)
  const [currGroupNum, doSetCurrGroupNum] = useState(0)
  const currGroupNumRef = useRef(0)
  const setCurrGroupNum = (num: number) => {
    doSetCurrGroupNum(num)
    currGroupNumRef.current = num
  }
  const getCurrGroupNum = () => {
    return currGroupNumRef.current
  }
  const allSuccessTaskList = allTaskList.filter(task => task.status === TaskStatus.completed)
  const allFailedTaskList = allTaskList.filter(task => task.status === TaskStatus.failed)
  const allTaskFinished = allTaskList.every(task => task.status === TaskStatus.completed)
  const allTaskRuned = allTaskList.every(task => [TaskStatus.completed, TaskStatus.failed].includes(task.status))
  const [batchCompletionRes, doSetBatchCompletionRes] = useState<Record<string, string>>({})
  const batchCompletionResRef = useRef<Record<string, string>>({})
  const setBatchCompletionRes = (res: Record<string, string>) => {
    doSetBatchCompletionRes(res)
    batchCompletionResRef.current = res
  }
  const getBatchCompletionRes = () => batchCompletionResRef.current
  const exportRes = allTaskList.map((task) => {
    const batchCompletionResLatest = getBatchCompletionRes()
    const res: Record<string, string> = {}
    const { inputs } = task.params
    promptConfig?.prompt_variables.forEach((v) => {
      res[v.name] = inputs[v.key]
    })
    res[t('app.generation.completionResult')] = batchCompletionResLatest[task.id]
    return res
  })
  const checkBatchInputs = (data: string[][]) => {
    if (!data || data.length === 0) {
      notify({ type: 'error', message: t('app.generation.errorMsg.empty') })
      return false
    }
    const headerData = data[0]
    let isMapVarName = true
    promptConfig?.prompt_variables.forEach((item, index) => {
      if (!isMapVarName)
        return

      if (item.name !== headerData[index])
        isMapVarName = false
    })

    if (!isMapVarName) {
      notify({ type: 'error', message: t('app.generation.errorMsg.fileStructNotMatch') })
      return false
    }

    let payloadData = data.slice(1)
    if (payloadData.length === 0) {
      notify({ type: 'error', message: t('app.generation.errorMsg.atLeastOne') })
      return false
    }

    // check middle empty line
    const allEmptyLineIndexes = payloadData.filter(item => item.every(i => i === '')).map(item => payloadData.indexOf(item))
    if (allEmptyLineIndexes.length > 0) {
      let hasMiddleEmptyLine = false
      let startIndex = allEmptyLineIndexes[0] - 1
      allEmptyLineIndexes.forEach((index) => {
        if (hasMiddleEmptyLine)
          return

        if (startIndex + 1 !== index) {
          hasMiddleEmptyLine = true
          return
        }
        startIndex++
      })

      if (hasMiddleEmptyLine) {
        notify({ type: 'error', message: t('app.generation.errorMsg.emptyLine', { rowIndex: startIndex + 2 }) })
        return false
      }
    }

    // check row format
    payloadData = payloadData.filter(item => !item.every(i => i === ''))
    // after remove empty rows in the end, checked again
    if (payloadData.length === 0) {
      notify({ type: 'error', message: t('app.generation.errorMsg.atLeastOne') })
      return false
    }
    let errorRowIndex = 0
    let requiredVarName = ''
    let moreThanMaxLengthVarName = ''
    let maxLength = 0
    payloadData.forEach((item, index) => {
      if (errorRowIndex !== 0)
        return

      promptConfig?.prompt_variables.forEach((varItem, varIndex) => {
        if (errorRowIndex !== 0)
          return
        if (varItem.type === 'string') {
          const maxLen = varItem.max_length || DEFAULT_VALUE_MAX_LEN
          if (item[varIndex].length > maxLen) {
            moreThanMaxLengthVarName = varItem.name
            maxLength = maxLen
            errorRowIndex = index + 1
            return
          }
        }
        if (varItem.required === false)
          return

        if (item[varIndex].trim() === '') {
          requiredVarName = varItem.name
          errorRowIndex = index + 1
        }
      })
    })

    if (errorRowIndex !== 0) {
      if (requiredVarName)
        notify({ type: 'error', message: t('app.generation.errorMsg.invalidLine', { rowIndex: errorRowIndex + 1, varName: requiredVarName }) })

      if (moreThanMaxLengthVarName)
        notify({ type: 'error', message: t('app.generation.errorMsg.moreThanMaxLengthLine', { rowIndex: errorRowIndex + 1, varName: moreThanMaxLengthVarName, maxLength }) })

      return false
    }
    return true
  }

  const handleRunBatch = (data: string[][]) => {
    if (!checkBatchInputs(data))
      return
    if (!allTaskFinished) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForBatchResponse') })
      return
    }

    const payloadData = data.filter(item => !item.every(i => i === '')).slice(1)
    const varLen = promptConfig?.prompt_variables.length || 0
    setIsCallBatchAPI(true)
    const allTaskList: Task[] = payloadData.map((item, i) => {
      const inputs: Record<string, string> = {}
      if (varLen > 0) {
        item.slice(0, varLen).forEach((input, index) => {
          inputs[promptConfig?.prompt_variables[index].key as string] = input
        })
      }
      return {
        id: i + 1,
        status: i < GROUP_SIZE ? TaskStatus.running : TaskStatus.pending,
        params: {
          inputs,
        },
      }
    })
    setAllTaskList(allTaskList)

    setControlSend(Date.now())
    // clear run once task status
    setControlStopResponding(Date.now())
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    showResSidebar()
  }

  const handleCompleted = (completionRes: string, taskId?: number, isSuccess?: boolean) => {
    const allTasklistLatest = getLatestTaskList()
    const batchCompletionResLatest = getBatchCompletionRes()
    const pendingTaskList = allTasklistLatest.filter(task => task.status === TaskStatus.pending)
    const hadRunedTaskNum = 1 + allTasklistLatest.filter(task => [TaskStatus.completed, TaskStatus.failed].includes(task.status)).length
    const needToAddNextGroupTask = (getCurrGroupNum() !== hadRunedTaskNum) && pendingTaskList.length > 0 && (hadRunedTaskNum % GROUP_SIZE === 0 || (allTasklistLatest.length - hadRunedTaskNum < GROUP_SIZE))
    // avoid add many task at the same time
    if (needToAddNextGroupTask)
      setCurrGroupNum(hadRunedTaskNum)
    // console.group()
    // console.log(`[#${taskId}]: ${isSuccess ? 'success' : 'fail'}.currGroupNum: ${getCurrGroupNum()}.hadRunedTaskNum: ${hadRunedTaskNum}, needToAddNextGroupTask: ${needToAddNextGroupTask}`)
    // console.log([...allTasklistLatest.filter(task => [TaskStatus.completed, TaskStatus.failed].includes(task.status)).map(item => item.id), taskId].sort((a: any, b: any) => a - b).join(','))
    // console.groupEnd()
    const nextPendingTaskIds = needToAddNextGroupTask ? pendingTaskList.slice(0, GROUP_SIZE).map(item => item.id) : []
    const newAllTaskList = allTasklistLatest.map((item) => {
      if (item.id === taskId) {
        return {
          ...item,
          status: isSuccess ? TaskStatus.completed : TaskStatus.failed,
        }
      }
      if (needToAddNextGroupTask && nextPendingTaskIds.includes(item.id)) {
        return {
          ...item,
          status: TaskStatus.running,
        }
      }
      return item
    })
    setAllTaskList(newAllTaskList)
    if (taskId) {
      setBatchCompletionRes({
        ...batchCompletionResLatest,
        [`${taskId}`]: completionRes,
      })
    }
  }

  useEffect(() => {
    if (!hasSetAppConfig) {
      setAppUnavailable(true)
      return
    }
    (async () => {
      try {
        changeLanguage(APP_INFO.default_language)

        const { user_input_form, file_upload, system_parameters }: any = await fetchAppParams()
        const prompt_variables = userInputsFormToPromptVariables(user_input_form)

        setPromptConfig({
          prompt_template: '',
          prompt_variables,
        } as PromptConfig)
        setVisionConfig({
          ...file_upload.image,
          image_file_size_limit: system_parameters?.image_file_size_limit || 0,
        })
      }
      catch (e: any) {
        if (e.status === 404) {
          setAppUnavailable(true)
        }
        else {
          setIsUnknwonReason(true)
          setAppUnavailable(true)
        }
      }
    })()
  }, [])

  useEffect(() => {
    if (APP_INFO?.title)
      document.title = `${APP_INFO.title} - Powered by @DPASANAA`
  }, [APP_INFO?.title])

  const [isShowResSidebar, { setTrue: showResSidebar, setFalse: hideResSidebar }] = useBoolean(false)
  const resRef = useRef<HTMLDivElement>(null)
  useClickAway(() => {
    hideResSidebar()
  }, resRef)

  const renderRes = (task?: Task) => (
    <Result
      isWorkflow={IS_WORKFLOW}
      isCallBatchAPI={isCallBatchAPI}
      isPC={isPC}
      isMobile={isMobile}
      isError={task?.status === TaskStatus.failed}
      promptConfig={promptConfig}
      inputs={isCallBatchAPI ? (task as Task).params.inputs : inputs}
      controlSend={controlSend}
      controlRetry={task?.status === TaskStatus.failed ? controlRetry : 0}
      controlStopResponding={controlStopResponding}
      onShowRes={showResSidebar}
      taskId={task?.id}
      onCompleted={handleCompleted}
      visionConfig={visionConfig}
      completionFiles={completionFiles}
    />
  )

  const renderBatchRes = () => {
    return (showTaskList.map(task => renderRes(task)))
  }

  const renderResWrap = (
    <div
      ref={resRef}
      className={
        cn(
          'flex flex-col h-full shrink-0',
          isPC ? 'px-10 py-8' : 'bg-gray-50',
          isTablet && 'p-6', isMobile && 'p-4')
      }
    >
      <>
        <div className='shrink-0 flex items-center justify-between'>
          <div className='flex items-center space-x-3'>
            <div className={s.starIcon}></div>
            <div className='text-lg text-gray-800 font-semibold'>{t('app.generation.title')}</div>
          </div>
          <div className='flex items-center space-x-2'>
            {allFailedTaskList.length > 0 && (
              <div className='flex items-center'>
                <AlertCircle className='w-4 h-4 text-[#D92D20]' />
                <div className='ml-1 text-[#D92D20]'>{t('app.generation.batchFailed.info', { num: allFailedTaskList.length })}</div>
                <Button
                  type='primary'
                  className='ml-2 !h-8 !px-3'
                  onClick={handleRetryAllFailedTask}
                >{t('app.generation.batchFailed.retry')}</Button>
                <div className='mx-3 w-[1px] h-3.5 bg-gray-200'></div>
              </div>
            )}
            {allSuccessTaskList.length > 0 && (
              <ResDownload
                isMobile={isMobile}
                values={exportRes}
              />
            )}
            {!isPC && (
              <div
                className='flex items-center justify-center cursor-pointer'
                onClick={hideResSidebar}
              >
                <XMarkIcon className='w-4 h-4 text-gray-800' />
              </div>
            )}
          </div>
        </div>

        <div className='grow overflow-y-auto'>
          {!isCallBatchAPI ? renderRes() : renderBatchRes()}
          {!noPendingTask && (
            <div className='mt-4'>
              <Loading type='area' />
            </div>
          )}
          <img class="size-full wp-image-1137 aligncenter" src="https://www.dpasanaa.net/wp-content/uploads/2023/10/%E0%B8%9C%E0%B8%87%E0%B8%81%E0%B8%A5%E0%B9%89%E0%B8%A7%E0%B8%A2%E0%B8%94%E0%B8%B4%E0%B8%9A-%E0%B8%AD%E0%B8%AD%E0%B9%81%E0%B8%81%E0%B8%99%E0%B8%B4%E0%B8%84-%E0%B8%81%E0%B8%A5%E0%B9%89%E0%B8%A7%E0%B8%A2%E0%B8%94%E0%B8%B4%E0%B8%9A%E0%B8%8A%E0%B8%99%E0%B8%B4%E0%B8%94%E0%B8%9C%E0%B8%87-%E0%B8%9C%E0%B8%87%E0%B8%81%E0%B8%A5%E0%B9%89%E0%B8%A7%E0%B8%A2%E0%B8%94%E0%B8%B4%E0%B8%9A%E0%B8%9A%E0%B8%94-%E0%B8%A2%E0%B8%B2%E0%B9%81%E0%B8%81%E0%B9%89%E0%B8%81%E0%B8%A3%E0%B8%94%E0%B9%84%E0%B8%AB%E0%B8%A5%E0%B8%A2%E0%B9%89%E0%B8%AD%E0%B8%99-200x200.jpg" alt="" width="200" height="200" />
          <a href="https://shop.line.me/@879pvhac/product/319489881" target="_blank" rel="noopener"> สั่งผ่าน LINE (โปรค่าส่ง 19 บ.ไปรษณีย์ &lt;--กดเลย)</a>
          "หากมีโปรแพลทฟอร์มไหนก็สั่งแพลทฟอร์มนั้นได้เลยนะคร้าบ"
          <a href="https://www.lazada.co.th/products/organic-1-250g-dpasanaa-i1436638555-s3722374209.html?c=&channelLpJumpArgs=&clickTrackInfo=query%253A%2525E0%2525B8%25259C%2525E0%2525B8%252587%2525E0%2525B8%252581%2525E0%2525B8%2525A5%2525E0%2525B9%252589%2525E0%2525B8%2525A7%2525E0%2525B8%2525A2%2525E0%2525B8%252594%2525E0%2525B8%2525B4%2525E0%2525B8%25259A%253Bnid%253A1436638555%253Bsrc%253ALazadaMainSrp%253Brn%253A580d0be9b34dc765faeff6140fb17eac%253Bregion%253Ath%253Bsku%253A1436638555_TH%253Bprice%253A220%253Bclient%253Adesktop%253Bsupplier_id%253A100108305%253Bbiz_source%253Ah5_hp%253Bslot%253A12%253Butlog_bucket_id%253A470687%253Basc_category_id%253A6898%253Bitem_id%253A1436638555%253Bsku_id%253A3722374209%253Bshop_id%253A137199&fastshipping=0&freeshipping=1&fs_ab=2&fuse_fs=&lang=th&location=%E0%B8%99%E0%B8%99%E0%B8%97%E0%B8%9A%E0%B8%B8%E0%B8%A3%E0%B8%B5&price=2.2E%202&priceCompare=skuId%3A3722374209%3Bsource%3Alazada-search-voucher%3Bsn%3A580d0be9b34dc765faeff6140fb17eac%3BunionTrace%3Aa3b5119917156996556475074e%3BoriginPrice%3A22000%3BvoucherPrice%3A22000%3BdisplayPrice%3A22000%3BsinglePromotionId%3A-1%3BsingleToolCode%3A-1%3BvoucherPricePlugin%3A1%3BbuyerId%3A0%3Btimestamp%3A1715699656127&ratingscore=4.957049486461251&request_id=580d0be9b34dc765faeff6140fb17eac&review=1071&sale=5496&search=1&source=search&spm=a2o4m.searchlist.list.12&stock=1" target="_blank" rel="noopener"> สั่งผ่าน LAZADA &lt;--กดเลย </a>
          <a href="https://shopee.co.th/product/28390542/7745584077/" target="_blank" rel="noopener"> สั่งผ่าน SHOPEE &lt;--กดเลย</a>
          <a href="https://shop.tiktok.com/view/product/1730128294628329886?region=TH&locale=th-TH/" target="_blank" rel="noopener"> สั่งผ่าน TIKTOK &lt;--กดเลย</a>
          </div>
      </>
    </div>
  )

  if (appUnavailable)
    return <AppUnavailable isUnknwonReason={isUnknwonReason} errMessage={!hasSetAppConfig ? 'Please set APP_ID and API_KEY in config/index.tsx' : ''} />

  if (!APP_INFO || !promptConfig)
    return <Loading type='app' />

  return (
    <>
      <div className={cn(isPC && 'flex', 'h-screen bg-gray-50')}>
        {/* Left */}
        <div className={cn(isPC ? 'w-[600px] max-w-[50%] p-8' : 'p-4', 'shrink-0 relative flex flex-col pb-10 h-full border-r border-gray-100 bg-white')}>
          <div className='mb-6'>
            <div className='flex justify-between items-center'>
              <div className='flex items-center space-x-3'>
                <div className={cn(s.appIcon, 'shrink-0')}></div>
                <div className='text-lg text-gray-800 font-semibold'>{APP_INFO.title}</div>
              </div>
              {!isPC && (
                <Button
                  className='shrink-0 !h-8 !px-3'
                  onClick={showResSidebar}
                >
                  <div className='flex items-center space-x-2 text-primary-600 text-[13px] font-medium'>
                    <div className={s.starIcon}></div>
                    <span>{t('app.generation.title')}</span>
                  </div>
                </Button>
              )}
            </div>
            {APP_INFO.description && (
              <div className='mt-2 text-xs text-gray-500'>{APP_INFO.description}</div>
            )}
          </div>

          <TabHeader
            items={[
              { id: 'create', name: t('app.generation.tabs.create') },
              { id: 'batch', name: t('app.generation.tabs.batch') },
            ]}
            value={currTab}
            onChange={setCurrTab}
          />

          <div className='grow h-20 overflow-y-auto'>
            <div className={cn(currTab === 'create' ? 'block' : 'hidden')}>
              <RunOnce
                inputs={inputs}
                onInputsChange={setInputs}
                promptConfig={promptConfig}
                onSend={handleSend}
                visionConfig={visionConfig}
                onVisionFilesChange={setCompletionFiles}
              />
            </div>
            <div className={cn(isInBatchTab ? 'block' : 'hidden')}>
              <RunBatch
                vars={promptConfig.prompt_variables}
                onSend={handleRunBatch}
                isAllFinished={allTaskRuned}
              />
            </div>
          </div>

          {/* copyright */}
          <div className='fixed left-8 bottom-4  flex space-x-2 text-gray-400 font-normal text-xs'>
            <div className="">© {APP_INFO.copyright || APP_INFO.title} {(new Date()).getFullYear()}</div>
            {APP_INFO.privacy_policy && (
              <>
                <div>·</div>
                <div>{t('app.generation.privacyPolicyLeft')}
                  <a
                    className='text-gray-500'
                    href={APP_INFO.privacy_policy}
                    target='_blank'>{t('app.generation.privacyPolicyMiddle')}</a>
                  {t('app.generation.privacyPolicyRight')}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Result */}
        {isPC && (
          <div className='grow h-full'>
            {renderResWrap}
          </div>
        )}

        {(!isPC && isShowResSidebar) && (
          <div
            className={cn('fixed z-50 inset-0', isTablet ? 'pl-[128px]' : 'pl-6')}
            style={{
              background: 'rgba(35, 56, 118, 0.2)',
            }}
          >
            {renderResWrap}
          </div>
        )}
      </div>
    </>
  )
}

export default TextGeneration
