import { setZoneStageAction } from '@/app/(app)/assessment/hitting/zones/actions';
import { ActionForm } from '@/components/assessment/action-form';
import { SelectField, TextField } from '@/components/ui/field';
import { zoneStage } from '@/lib/assessment/zones/content';
import { ZONE_IDS, type ZoneId } from '@/lib/assessment/zones/types';

/**
 * A stage decision for one zone: set a starting stage, advance (one up), hold,
 * simplify (back), or deliberately reset to another stage — always with a
 * reason and the evidence. A stage the development coach decided is changed
 * only by the coach.
 */
export function StageForm({
  zone,
  current,
  athleteId,
  sessionId = null,
  editable,
  lockedByCoach = false,
  evidence = '',
  headingLevel = 3,
}: {
  readonly zone: ZoneId;
  readonly current: number | null;
  readonly athleteId: string;
  readonly sessionId?: string | null;
  readonly editable: boolean;
  /** The viewer is on the athlete's side and the coach decided the current stage. */
  readonly lockedByCoach?: boolean;
  readonly evidence?: string;
  readonly headingLevel?: 2 | 3;
}) {
  return (
    <div className="space-y-3 rounded-md border-2 border-rule p-4" data-testid={`stage-form-${zone}`}>
      {headingLevel === 2 ? <h2 className="text-xl font-semibold text-navy">Zone {zone}</h2> : <h3 className="text-xl font-semibold text-navy">Zone {zone}</h3>}
      <p>{current ? `Now at stage ${current}: ${zoneStage(current)?.name ?? ''}` : 'No stage set yet.'}</p>
      {editable && lockedByCoach ? <p className="text-sm text-slate">The development coach set this stage; only they can change it.</p> : null}
      {editable && !lockedByCoach ? (
        <ActionForm
          action={setZoneStageAction}
          fields={{ athleteId, zone: String(zone), sessionId: sessionId ?? '', current: current ? String(current) : '' }}
          submitLabel="Save stage decision"
        >
          <SelectField id={`stage-${zone}-decision`} name="decision" label="Decision" defaultValue={current ? 'hold' : 'set'}>
            {current ? (
              <>
                <option value="advance">Advance (one stage up)</option>
                <option value="hold">Hold</option>
                <option value="simplify">Simplify (an earlier stage)</option>
              </>
            ) : null}
            <option value="set">{current ? 'Reset to another stage' : 'Set a starting stage'}</option>
          </SelectField>
          <SelectField
            id={`stage-${zone}-stage`}
            name="stage"
            label={current ? 'Stage (for simplify or a reset)' : 'Starting stage'}
            hint={current ? 'Advance always moves up one stage and hold keeps the current one.' : undefined}
            defaultValue={String(current ?? 1)}
          >
            {ZONE_IDS.map((stage) => (
              <option key={stage} value={stage}>
                {stage}. {zoneStage(stage)?.name}
              </option>
            ))}
          </SelectField>
          <TextField id={`stage-${zone}-reason`} name="reason" label="Reason" required minLength={3} maxLength={500} />
          <TextField
            id={`stage-${zone}-evidence`}
            name="evidence"
            label="Evidence"
            hint="The counts or observations this is based on, e.g. “depth 9 of 12 on two comparable rounds”."
            required
            minLength={3}
            maxLength={500}
            defaultValue={evidence}
          />
        </ActionForm>
      ) : null}
    </div>
  );
}
