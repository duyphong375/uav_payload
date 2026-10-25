import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Có sự cố khi hiển thị giao diện
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Trình duyệt gặp lỗi khi kết xuất thành phần giao diện. Bạn có thể tải lại trang hoặc kiểm tra kết nối.
            </p>
            {this.state.error && (
              <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-card p-3 text-left font-mono text-xs text-destructive border border-border">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={this.handleReload} className="gap-2">
                <RotateCw className="h-4 w-4" />
                Tải lại trang
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
