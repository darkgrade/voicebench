import { BENCH, type ModelDetail, type ModelSummary, TABS } from '@site/data'
import { Shell, tabPath } from '@site/kit/shell'
import { ModelPage } from '@site/pages/model'

/** One model's own page, in the same frame as the overview; its tabs lead back to the overview's views. */
export function Entry({ model, detail }: { model: ModelSummary; detail: ModelDetail | undefined }) {
    return (
        <Shell bench={BENCH} tabs={TABS} tab="" onTab={id => location.assign(tabPath(BENCH, TABS, id))}>
            <div className="h-full overflow-y-auto">
                <ModelPage model={model} detail={detail} />
            </div>
        </Shell>
    )
}
