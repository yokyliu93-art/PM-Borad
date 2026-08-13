import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid place-items-center h-64">
          <div className="text-center">
            <p className="text-red-400 text-lg font-semibold">页面渲染出错</p>
            <pre className="mt-3 text-xs text-slate-400 max-w-lg overflow-auto">{this.state.error.message}</pre>
            <pre className="mt-2 text-xs text-slate-500 max-w-lg overflow-auto whitespace-pre-wrap">{this.state.error.stack}</pre>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="mt-4 rounded-md bg-violet-500 px-3 py-2 text-sm text-white"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
