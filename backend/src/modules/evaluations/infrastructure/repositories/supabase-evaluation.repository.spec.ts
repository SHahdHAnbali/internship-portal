import { Logger } from '@nestjs/common';

import { SupabaseEvaluationRepository } from './supabase-evaluation.repository.js';

const MENTOR = 'mentor-id';
const INTERN = 'intern-id';

const draftRow = {
  evaluation_id: 'eval-1',
  placement_id: 'placement-1',
  placement_status: 'ACTIVE',
  content: '  Exact\r\ntext 😀 ',
  publication_state: 'DRAFT',
  revision: 1,
  published_content: null,
  published_revision: null,
  published_at: null,
  first_published_at: null,
  published_by_current_user: false,
  author_name: 'Mentor One',
  last_editor_name: 'Mentor One',
  created_at: 'c',
  updated_at: 'u',
  client_request_id: 'key-1',
  published_by_name: null,
};

const publishedRow = {
  ...draftRow,
  content: 'Edited after publication',
  publication_state: 'UNPUBLISHED_CHANGES',
  revision: 5,
  published_content: 'Published text',
  published_revision: 4,
  published_at: 'p',
  first_published_at: 'f',
  published_by_current_user: true,
  published_by_name: 'Mentor Two',
};

const internRow = {
  evaluation_id: 'eval-1',
  placement_id: 'placement-1',
  placement_status: 'COMPLETED',
  training_title: 'Engineering',
  company: 'Acme',
  content: 'Published text',
  published_at: 'p',
  author_name: 'Mentor One',
  published_by_name: 'Mentor Two',
};

function repositoryReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { rpc, repository: new SupabaseEvaluationRepository({ client: { rpc } } as never) };
}

describe('SupabaseEvaluationRepository', () => {
  it('calls the exact function names and arguments of the migration', async () => {
    const { rpc, repository } = repositoryReturning({ data: [draftRow], error: null });
    await repository.listForMentorPlacement(MENTOR, 'placement-1');
    expect(rpc).toHaveBeenLastCalledWith('list_mentor_evaluations', { p_mentor_profile_id: MENTOR, p_placement_id: 'placement-1' });
    await repository.getForMentor(MENTOR, 'eval-1');
    expect(rpc).toHaveBeenLastCalledWith('get_mentor_evaluation', { p_mentor_profile_id: MENTOR, p_evaluation_id: 'eval-1' });
    await repository.createForMentor(MENTOR, 'placement-1', 'key-1', 'Text');
    expect(rpc).toHaveBeenLastCalledWith('create_mentor_evaluation', {
      p_mentor_profile_id: MENTOR, p_placement_id: 'placement-1', p_client_request_id: 'key-1', p_content: 'Text',
    });
    await repository.saveForMentor(MENTOR, 'eval-1', 3, 'Text 2');
    expect(rpc).toHaveBeenLastCalledWith('save_mentor_evaluation', {
      p_mentor_profile_id: MENTOR, p_evaluation_id: 'eval-1', p_expected_revision: 3, p_content: 'Text 2',
    });
    await repository.publishForMentor(MENTOR, 'eval-1', 4);
    expect(rpc).toHaveBeenLastCalledWith('publish_mentor_evaluation', { p_mentor_profile_id: MENTOR, p_evaluation_id: 'eval-1', p_expected_revision: 4 });
    expect(rpc).toHaveBeenCalledTimes(5);
    expect(rpc.mock.calls.some(([name]) => name === 'mentor_evaluation_rows')).toBe(false);
  });

  it('maps a draft exactly, with no snapshot and a server-derived state', async () => {
    const { repository } = repositoryReturning({ data: [draftRow], error: null });
    await expect(repository.getForMentor(MENTOR, 'eval-1')).resolves.toEqual({
      id: 'eval-1', placementId: 'placement-1', placementStatus: 'ACTIVE', readOnly: false,
      content: '  Exact\r\ntext 😀 ', publicationState: 'DRAFT', revision: 1, published: null,
      authorName: 'Mentor One', lastEditorName: 'Mentor One', clientRequestId: 'key-1', createdAt: 'c', updatedAt: 'u',
    });
  });

  it('keeps the working text and the published snapshot separate', async () => {
    const { repository } = repositoryReturning({ data: [{ ...publishedRow, placement_status: 'COMPLETED' }], error: null });
    const evaluation = await repository.getForMentor(MENTOR, 'eval-1');
    expect(evaluation).toMatchObject({
      content: 'Edited after publication', publicationState: 'UNPUBLISHED_CHANGES', revision: 5, readOnly: true,
      published: {
        content: 'Published text', revision: 4, publishedAt: 'p', firstPublishedAt: 'f', publishedByCurrentUser: true,
        publishedByName: 'Mentor Two',
      },
      authorName: 'Mentor One',
    });
  });

  it('gives interns only the published snapshot fields', async () => {
    const { rpc, repository } = repositoryReturning({ data: [internRow], error: null });
    const [evaluation] = await repository.listForIntern(INTERN);
    expect(rpc).toHaveBeenLastCalledWith('list_my_evaluations', { p_auth_user_id: INTERN });
    expect(evaluation).toEqual({
      id: 'eval-1', placementId: 'placement-1', placementStatus: 'COMPLETED', trainingTitle: 'Engineering',
      company: 'Acme', content: 'Published text', publishedAt: 'p', authorName: 'Mentor One', publishedByName: 'Mentor Two',
    });
    expect(Object.keys(evaluation)).not.toEqual(expect.arrayContaining(['revision']));
    await repository.getForIntern(INTERN, 'eval-1');
    expect(rpc).toHaveBeenLastCalledWith('get_my_evaluation', { p_auth_user_id: INTERN, p_evaluation_id: 'eval-1' });
  });

  it('maps database errors to stable codes, with the conflict revision', async () => {
    const { repository } = repositoryReturning({
      data: null, error: { code: 'PZE05', message: 'evaluation_revision_conflict', details: '{"currentRevision" : 6}' },
    });
    await expect(repository.saveForMentor(MENTOR, 'eval-1', 5, 'x')).rejects.toMatchObject({
      status: 409, response: { code: 'EVALUATION_REVISION_CONFLICT', currentRevision: 6 },
    });
  });

  it.each([
    ['not an array', null],
    ['an unknown state', [{ ...draftRow, publication_state: 'ARCHIVED' }]],
    ['a non-integer revision', [{ ...draftRow, revision: '2' }]],
    ['a draft with a snapshot', [{ ...draftRow, published_content: 'x' }]],
    ['a published row without a snapshot', [{ ...publishedRow, published_content: null }]],
    ['a draft with a publisher', [{ ...draftRow, published_by_name: 'Someone' }]],
    ['a non-string client request id', [{ ...draftRow, client_request_id: 5 }]],
    ['a SCHEDULED placement', [{ ...draftRow, placement_status: 'SCHEDULED' }]],
    ['two rows for a single evaluation', [draftRow, draftRow]],
    ['no row for a single evaluation', []],
  ])('refuses a malformed result (%s) with a generic 500', async (_label, data) => {
    const { repository } = repositoryReturning({ data, error: null });
    await expect(repository.getForMentor(MENTOR, 'eval-1')).rejects.toMatchObject({
      status: 500, response: { code: 'EVALUATION_SERVER_ERROR' },
    });
  });

  it('refuses malformed intern rows', async () => {
    const { repository } = repositoryReturning({ data: [{ ...internRow, content: null }], error: null });
    await expect(repository.listForIntern(INTERN)).rejects.toMatchObject({ status: 500 });
  });

  it('maps a reused create key to 409 with the existing evaluation id', async () => {
    const id = '0f8e3b52-4a3c-4d7e-9b1a-2c3d4e5f6a7b';
    const { rpc, repository } = repositoryReturning({
      data: null, error: { code: 'PZE11', message: 'evaluation_create_key_reused', details: `{"evaluationId" : "${id}"}` },
    });
    await expect(repository.createForMentor(MENTOR, 'placement-1', 'key-1', 'Other text')).rejects.toMatchObject({
      status: 409, response: { code: 'EVALUATION_CREATE_KEY_REUSED', evaluationId: id },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  describe('diagnostic logging', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('logs an unmapped database error with the function and a safe code only', async () => {
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { repository } = repositoryReturning({
        data: null, error: { code: 'PGRST202', message: 'Could not find the function create_mentor_evaluation(secret)', details: 'private text' },
      });
      await expect(repository.createForMentor(MENTOR, 'placement-1', 'key-1', 'Private evaluation text')).rejects.toMatchObject({ status: 500 });
      expect(log).toHaveBeenCalledTimes(1);
      const line = String(log.mock.calls[0][0]);
      expect(line).toBe('Evaluation database call failed: function=create_mentor_evaluation code=PGRST202');
      for (const secret of ['Private evaluation text', 'private text', 'secret', MENTOR, 'placement-1', 'key-1']) expect(line).not.toContain(secret);
    });

    it('reports a malformed error code as unknown', async () => {
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { repository } = repositoryReturning({ data: null, error: { code: 'x; drop table', message: 'boom' } });
      await expect(repository.getForMentor(MENTOR, 'eval-1')).rejects.toMatchObject({ status: 500 });
      expect(String(log.mock.calls[0][0])).toBe('Evaluation database call failed: function=get_mentor_evaluation code=unknown');
    });

    it('does not log expected conditions (access, conflicts, validation)', async () => {
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      for (const code of ['PZE01', 'PZE05', 'PZE11', '40P01']) {
        const { repository } = repositoryReturning({ data: null, error: { code, message: 'x' } });
        await expect(repository.getForMentor(MENTOR, 'eval-1')).rejects.toBeTruthy();
      }
      expect(log).not.toHaveBeenCalled();
    });

    it('logs an unexpected result shape with the function name only', async () => {
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { repository } = repositoryReturning({ data: [{ ...draftRow, revision: 'x' }], error: null });
      await expect(repository.getForMentor(MENTOR, 'eval-1')).rejects.toMatchObject({ status: 500 });
      expect(String(log.mock.calls[0][0])).toBe('Evaluation database call returned an unexpected result: function=get_mentor_evaluation');
    });
  });

  it('makes exactly one call per operation, also when it fails (no retry)', async () => {
    const { rpc, repository } = repositoryReturning({ data: null, error: { code: '40P01', message: 'deadlock detected' } });
    await expect(repository.publishForMentor(MENTOR, 'eval-1', 2)).rejects.toMatchObject({
      status: 409, response: { code: 'EVALUATION_CONCURRENT_UPDATE' },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
