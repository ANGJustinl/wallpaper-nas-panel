import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { App } from './App';

const mockApi = (globalThis as typeof globalThis & {
  __panelMockApi: {
    failRoute: (route: 'workshop' | 'tasks' | 'library' | 'settings' | 'createTask' | 'retryTask' | 'deleteTask' | 'deleteDownloadedContent' | 'rescanDownloadedContents' | 'clearTaskHistory' | 'steamLoginState' | 'steamLogin') => void;
    reset: () => void;
  };
}).__panelMockApi;

afterEach(() => {
  vi.clearAllMocks();
  mockApi.reset();
});

describe('App shell', () => {
  it('renders explore as the default page with top-level navigation', async () => {
    render(<App />);

    await screen.findAllByLabelText(/选择 /i);

    expect(screen.getByRole('link', { name: /探索/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /任务/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /设置/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /探索创意工坊/i })).toBeInTheDocument();
    expect(screen.getAllByText(/wallpaper engine：壁纸引擎/i).length).toBeGreaterThan(0);
  });

  it('switches to the dedicated steam login page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /steam 登录/i }));

    expect(screen.getByRole('heading', { name: /登录到创意工坊/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/steam 账号/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/steam 密码/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/steam 令牌/i)).toBeInTheDocument();
  });

  it('blocks steam login submission when steamcmd runtime is unavailable', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /steam 登录/i }));

    expect(screen.getByText(/当前无法调用 steamcmd/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /登录 steam/i })).toBeDisabled();
  });

  it('lets the user edit filters before applying them', async () => {
    const user = userEvent.setup();
    render(<App />);

    const search = screen.getByLabelText(/搜索工坊/i);
    await user.type(search, 'wallpaper');
    await user.click(screen.getByRole('checkbox', { name: /Anime/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: /category/i }), 'Wallpaper');
    await user.selectOptions(screen.getByRole('combobox', { name: /排序方式/i }), 'vote');
    await user.selectOptions(screen.getByRole('combobox', { name: /时间范围/i }), '90d');
    await user.click(screen.getByRole('checkbox', { name: /Approved/i }));

    expect(screen.getByDisplayValue('wallpaper')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Anime/i })).toBeChecked();
    expect(screen.getByRole('combobox', { name: /category/i })).toHaveValue('Wallpaper');
    expect(screen.getByRole('combobox', { name: /排序方式/i })).toHaveValue('vote');
    expect(screen.getByRole('combobox', { name: /时间范围/i })).toHaveValue('90d');
    expect(screen.getByRole('checkbox', { name: /Approved/i })).toBeChecked();
    expect(screen.getByRole('button', { name: /应用筛选/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /清空筛选/i })).toBeInTheDocument();
  });

  it('sends aligned Steam filter params when filters are applied', async () => {
    const user = userEvent.setup();
    render(<App />);

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();

    await user.click(screen.getByRole('checkbox', { name: /Approved/i }));
    await user.click(screen.getByRole('checkbox', { name: /Anime/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: /category/i }), 'Wallpaper');
    await user.click(screen.getByRole('button', { name: /应用筛选/i }));

    await waitFor(() => {
      const workshopRequest = fetchMock.mock.calls
        .map(([input]) => String(input))
        .find((value) => value.includes('/api/workshop/items'));

      expect(workshopRequest).toBeDefined();

      const params = new URL(workshopRequest ?? '', 'http://localhost').searchParams;
      expect(params.getAll('miscellaneous')).toEqual(['Approved']);
      expect(params.getAll('genre')).toEqual(['Anime']);
      expect(params.get('category')).toBe('Wallpaper');
    });
  });

  it('supports explicit selection mode and batch queueing with task guidance', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /开始选取/i }));
    expect(screen.getByText(/框选模式已开启/i)).toBeInTheDocument();

    const checkboxes = await screen.findAllByLabelText(/选择 /i);
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    await user.click(screen.getByRole('button', { name: /批量加入下载/i }));

    expect(screen.getByRole('heading', { name: /探索创意工坊/i })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /查看任务/i }));
    expect(screen.getByRole('heading', { name: /进行中的任务/i })).toBeInTheDocument();
  });

  it('supports ctrl and shift assisted selection shortcuts', async () => {
    render(<App />);
    const selectionStat = screen.getByText('已选择').parentElement as HTMLElement;

    const checkboxes = await screen.findAllByLabelText(/选择 /i);

    fireEvent.click(checkboxes[0]);
    expect(selectionStat).toHaveTextContent('1');

    fireEvent.click(checkboxes[2], { shiftKey: true });
    expect(selectionStat).toHaveTextContent('3');

    fireEvent.click(checkboxes[1], { ctrlKey: true });
    expect(selectionStat).toHaveTextContent('2');
  });

  it('shows a visible warning when workshop results fall back to local data', async () => {
    mockApi.failRoute('workshop');
    render(<App />);

    expect(await screen.findByText(/工坊结果已降级/i)).toBeInTheDocument();
    expect(screen.getByText(/当前显示本地示例结果/i)).toBeInTheDocument();
  });

  it('shows worker heartbeat details on the task center page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /任务/i }));

    expect(screen.getByText(/下载器状态/i)).toBeInTheDocument();
    expect(screen.getByText(/处理中/i)).toBeInTheDocument();
    expect(screen.getAllByText(/test-runner/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/正在下载项目 3648823629/i)).toBeInTheDocument();
  });

  it('lets the user delete a history task record', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /任务/i }));
    await user.click(screen.getByRole('button', { name: /删除记录 neon drift corridor/i }));

    await waitFor(() => {
      expect(screen.queryByText(/neon drift corridor/i)).not.toBeInTheDocument();
    });
  });

  it('shows downloaded content details in a file-manager style inspector', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /内容库/i }));

    expect(await screen.findByRole('heading', { name: /已下载内容管理/i })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /neon drift corridor/i }).length).toBeGreaterThan(0);
    expect(screen.getByText(/查看创意工坊页面/i)).toBeInTheDocument();
    expect(screen.getByText(/Miscellaneous/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Ultrawide 3440 x 1440/i).length).toBeGreaterThan(0);
  });

  it('lets the user remove a downloaded content record while keeping files by default', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /内容库/i }));
    await screen.findByRole('heading', { name: /已下载内容管理/i });
    await user.click(screen.getByRole('button', { name: /移除记录/i }));
    expect(screen.getByRole('dialog', { name: /确认移除内容/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /同时删除本地文件/i })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: /确认移除/i }));

    await waitFor(() => {
      expect(screen.queryByText(/neon drift corridor/i)).not.toBeInTheDocument();
    });

    const deleteRequest = vi.mocked(globalThis.fetch).mock.calls
      .map(([input]) => String(input))
      .find((value) => value.includes('/api/library/3648823629'));
    expect(deleteRequest).toBeDefined();
    expect(deleteRequest).not.toContain('deleteFiles=true');
  });

  it('can delete local files from the content removal confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /内容库/i }));
    await screen.findByRole('heading', { name: /已下载内容管理/i });
    await user.click(screen.getByRole('button', { name: /移除记录/i }));
    await user.click(screen.getByRole('checkbox', { name: /同时删除本地文件/i }));
    await user.click(screen.getByRole('button', { name: /确认移除/i }));

    await waitFor(() => {
      const deleteRequest = vi.mocked(globalThis.fetch).mock.calls
        .map(([input]) => String(input))
        .find((value) => value.includes('/api/library/3648823629'));
      expect(deleteRequest).toContain('deleteFiles=true');
    });
  });

  it('rescans the content library and surfaces a success summary', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /内容库/i }));
    await screen.findByRole('heading', { name: /已下载内容管理/i });
    await user.click(screen.getByRole('button', { name: /重扫\/校验/i }));

    expect(await screen.findByText(/内容库已更新/i)).toBeInTheDocument();
    expect(screen.getByText(/更新 1 个项目/i)).toBeInTheDocument();
  });

  it('shows an error when content library rescan fails', async () => {
    const user = userEvent.setup();
    mockApi.failRoute('rescanDownloadedContents');
    render(<App />);

    await user.click(screen.getByRole('link', { name: /内容库/i }));
    await screen.findByRole('heading', { name: /已下载内容管理/i });
    await user.click(screen.getByRole('button', { name: /重扫\/校验/i }));

    expect(await screen.findByText(/内容记录操作失败/i)).toBeInTheDocument();
    expect(screen.getByText(/内容库重扫失败/i)).toBeInTheDocument();
  });

  it('surfaces task sync failures instead of silently keeping stale data', async () => {
    const user = userEvent.setup();
    mockApi.failRoute('tasks');
    render(<App />);

    await user.click(screen.getByRole('link', { name: /任务/i }));

    expect(await screen.findByText(/任务状态同步失败/i)).toBeInTheDocument();
    expect(screen.getByText(/当前显示的是面板内置占位数据/i)).toBeInTheDocument();
  });

  it('lets the user edit and save downloader settings', async () => {
    const user = userEvent.setup();
    render(<App />);
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();

    await user.click(screen.getByRole('link', { name: /设置/i }));
    await user.clear(screen.getByDisplayValue('/data/downloads/431960'));
    await user.type(screen.getByLabelText(/下载目录/i), '/volume1/wallpapers');
    await user.clear(screen.getByDisplayValue('1250'));
    await user.type(screen.getByLabelText(/请求间隔/i), '2000');
    await user.click(screen.getByRole('checkbox', { name: /生成 Jellyfin 兼容旁挂文件/i }));
    await user.click(screen.getByRole('checkbox', { name: /删除确认默认勾选本地文件/i }));
    await user.click(screen.getByRole('button', { name: /保存全部设置/i }));

    expect(await screen.findByText(/设置已同步到后端/i)).toBeInTheDocument();
    const settingsRequest = fetchMock.mock.calls.find(([input, init]) => String(input).includes('/api/settings') && init?.method === 'PATCH');
    const payload = JSON.parse(String(settingsRequest?.[1]?.body ?? '{}'));
    expect(payload.mediaLibrary.jellyfinSidecars).toBe(false);
    expect(payload.contentLibrary.deleteFilesDefault).toBe(true);
  });

  it('shows an error when queueing a task fails', async () => {
    const user = userEvent.setup();
    mockApi.failRoute('createTask');
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /下载 neon drift corridor/i }));

    expect(await screen.findByText(/下载请求未送达/i)).toBeInTheDocument();
    expect(screen.getByText(/无法将《/i)).toBeInTheDocument();
  });
});
