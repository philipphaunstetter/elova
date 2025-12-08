import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'
import { Button } from '@/components/button'

interface TablePaginationProps {
    currentPage: number
    totalPages: number
    totalCount: number
    itemsPerPage: number
    onPageChange: (page: number) => void
}

export function TablePagination({
    currentPage,
    totalPages,
    totalCount,
    itemsPerPage,
    onPageChange
}: TablePaginationProps) {
    const startItem = (currentPage - 1) * itemsPerPage + 1
    const endItem = Math.min(currentPage * itemsPerPage, totalCount)

    const renderPageNumbers = () => {
        const pages = []
        const maxVisiblePages = 7

        if (totalPages <= maxVisiblePages) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i)
            }
        } else {
            if (currentPage <= 4) {
                for (let i = 1; i <= 5; i++) pages.push(i)
                pages.push('...')
                pages.push(totalPages)
            } else if (currentPage >= totalPages - 3) {
                pages.push(1)
                pages.push('...')
                for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
            } else {
                pages.push(1)
                pages.push('...')
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i)
                pages.push('...')
                pages.push(totalPages)
            }
        }

        return pages.map((page, index) => {
            if (page === '...') {
                return (
                    <span
                        key={`ellipsis-${index}`}
                        className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 focus:outline-offset-0 dark:text-gray-400 dark:ring-slate-600"
                    >
                        ...
                    </span>
                )
            }

            const isCurrent = page === currentPage
            return (
                <button
                    key={page}
                    onClick={() => onPageChange(page as number)}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 focus:outline-offset-0 cursor-pointer ${isCurrent
                            ? 'z-10 bg-rose-600 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
                            : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-slate-600 dark:hover:bg-slate-700'
                        }`}
                >
                    {page}
                </button>
            )
        })
    }

    return (
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
                <Button
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    outline
                    className="relative inline-flex items-center rounded-md px-4 py-2 text-sm font-medium"
                >
                    Previous
                </Button>
                <Button
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    outline
                    className="relative ml-3 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium"
                >
                    Next
                </Button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-gray-700 dark:text-gray-400">
                        Showing <span className="font-medium">{startItem}</span> to <span className="font-medium">{endItem}</span> of{' '}
                        <span className="font-medium">{totalCount}</span> results
                    </p>
                </div>
                <div>
                    <nav aria-label="Pagination" className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                        <button
                            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:ring-slate-600 dark:hover:bg-slate-700"
                        >
                            <span className="sr-only">Previous</span>
                            <ChevronLeftIcon aria-hidden="true" className="h-5 w-5" />
                        </button>
                        {renderPageNumbers()}
                        <button
                            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:ring-slate-600 dark:hover:bg-slate-700"
                        >
                            <span className="sr-only">Next</span>
                            <ChevronRightIcon aria-hidden="true" className="h-5 w-5" />
                        </button>
                    </nav>
                </div>
            </div>
        </div>
    )
}
